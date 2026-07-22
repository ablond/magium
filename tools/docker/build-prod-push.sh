#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

PUSH=0
IMAGE="${MAGIUM_IMAGE:-ghcr.io/ablond/magium}"
PLATFORM="${MAGIUM_PLATFORM:-linux/amd64}"
TAG="${MAGIUM_TAG:-$(date -u +%Y%m%d-%H%M%S)}"

for arg in "$@"; do
  case "$arg" in
    --push)
      PUSH=1
      ;;
    --no-push)
      PUSH=0
      ;;
    --image=*)
      IMAGE="${arg#*=}"
      ;;
    --platform=*)
      PLATFORM="${arg#*=}"
      ;;
    --tag=*)
      TAG="${arg#*=}"
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 2
      ;;
  esac
done

registry="${IMAGE%%/*}"
if [[ "$registry" != *.* && "$registry" != *:* && "$registry" != "localhost" ]]; then
  echo "Image must include a registry namespace, got: $IMAGE" >&2
  exit 2
fi

if [[ "$PLATFORM" == *,* ]]; then
  echo "MAGIUM_PLATFORM must be a single platform for local runtime validation, got: $PLATFORM" >&2
  exit 2
fi

case "$(uname -m)" in
  x86_64|amd64)
    LOCAL_PLATFORM="linux/amd64"
    ;;
  aarch64|arm64)
    LOCAL_PLATFORM="linux/arm64"
    ;;
  *)
    LOCAL_PLATFORM=""
    ;;
esac

if [[ -z "$LOCAL_PLATFORM" ]]; then
  echo "Unsupported local architecture for runtime validation: $(uname -m)" >&2
  exit 2
fi

if [[ "$PUSH" != "1" && "$PLATFORM" != "$LOCAL_PLATFORM" ]]; then
  echo "Non-push builds must target the local platform $LOCAL_PLATFORM, got: $PLATFORM" >&2
  echo "Use --push to build and publish a non-local platform after local validation." >&2
  exit 2
fi

TIMESTAMP_REF="${IMAGE}:${TAG}"
LATEST_REF="${IMAGE}:latest"
VALIDATION_REF="$TIMESTAMP_REF"

cleanup_paths=()
cleanup_containers=()
cleanup_networks=()
cleanup() {
  for container in "${cleanup_containers[@]:-}"; do
    docker rm -f "$container" >/dev/null 2>&1 || true
  done
  for path in "${cleanup_paths[@]:-}"; do
    rm -rf "$path"
  done
  for network in "${cleanup_networks[@]:-}"; do
    docker network rm "$network" >/dev/null 2>&1 || true
  done
}
trap cleanup EXIT

build_for_local_validation() {
  local ref="$1"
  echo "Building $ref for $LOCAL_PLATFORM validation"
  docker buildx build \
    --pull \
    --target prod \
    --platform "$LOCAL_PLATFORM" \
    --load \
    -t "$ref" \
    .
}

if [[ "$PLATFORM" == "$LOCAL_PLATFORM" ]]; then
  echo "Building $TIMESTAMP_REF and $LATEST_REF for $PLATFORM"
  docker buildx build \
    --pull \
    --target prod \
    --platform "$PLATFORM" \
    --load \
    -t "$TIMESTAMP_REF" \
    -t "$LATEST_REF" \
    .
else
  VALIDATION_REF="${IMAGE}:validation-${TAG}"
  build_for_local_validation "$VALIDATION_REF"
fi

echo "Inspecting runtime filesystem in $VALIDATION_REF"
container="$(docker create "$VALIDATION_REF")"
cleanup_containers+=("$container")
tmp_dir="$(mktemp -d)"
cleanup_paths+=("$tmp_dir")
docker cp "$container:/app/dist" "$tmp_dir/html"
docker rm "$container" >/dev/null
cleanup_containers=("${cleanup_containers[@]/$container}")

if find "$tmp_dir/html" -name '*.magium' -print -quit | grep -q .; then
  echo "Raw .magium file leaked into the runtime image" >&2
  exit 1
fi

if find "$tmp_dir/html" -name '*.json' -print -quit | grep -q .; then
  echo "Unexpected JSON asset leaked into the runtime image" >&2
  exit 1
fi

if find "$tmp_dir/html" -path '*node_modules*' -print -quit | grep -q .; then
  echo "node_modules leaked into the runtime image" >&2
  exit 1
fi

if find "$tmp_dir/html" -name '.env*' -print -quit | grep -q .; then
  echo "Environment file leaked into the runtime image" >&2
  exit 1
fi

if grep -R -I -n -E 'ID: Ch1-Intro1|chapters/ch1\.magium' "$tmp_dir/html" >/dev/null; then
  echo "Obvious raw source content leaked into the runtime image" >&2
  exit 1
fi

http_get() {
  local url="$1"
  if command -v curl >/dev/null 2>&1; then
    curl -fsS "$url"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO- "$url"
  else
    echo "curl or wget is required for HTTP validation" >&2
    exit 2
  fi
}

echo "Starting $VALIDATION_REF for HTTP validation"
validation_network="magium-validation-${TAG//[^a-zA-Z0-9_.-]/-}"
docker network create "$validation_network" >/dev/null
cleanup_networks+=("$validation_network")
database_container="$(docker run -d --rm \
  --network "$validation_network" \
  --network-alias postgres \
  -e POSTGRES_DB=magium \
  -e POSTGRES_USER=magium \
  -e POSTGRES_PASSWORD=magium-validation \
  postgres:18-alpine)"
cleanup_containers+=("$database_container")

for _ in $(seq 1 30); do
  if docker exec "$database_container" pg_isready -U magium -d magium >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
if ! docker exec "$database_container" pg_isready -U magium -d magium >/dev/null 2>&1; then
  echo "Validation PostgreSQL did not become ready" >&2
  exit 1
fi

run_container="$(docker run -d --rm \
  --network "$validation_network" \
  -p 127.0.0.1::8080 \
  -e DATABASE_URL=postgres://magium:magium-validation@postgres:5432/magium \
  -e PUBLIC_URL=http://localhost \
  -e TURNSTILE_DISABLED=1 \
  -e ADMIN_TOKEN=validation-admin-token \
  -e ADMIN_PASSWORD=validation-admin-password \
  -e ADMIN_SESSION_SECRET=validation-admin-session-secret \
  "$VALIDATION_REF")"
cleanup_containers+=("$run_container")

port=""
for _ in $(seq 1 30); do
  port="$(docker port "$run_container" 8080/tcp 2>/dev/null | awk -F: 'END {print $NF}')"
  if [[ -n "$port" ]] && http_get "http://127.0.0.1:${port}/" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if [[ -z "$port" ]]; then
  echo "Could not resolve mapped validation port" >&2
  exit 1
fi

http_get "http://127.0.0.1:${port}/" | grep -q '<div id="app"></div>'
http_get "http://127.0.0.1:${port}/sw.js" | grep -q 'CACHE_NAME'
http_get "http://127.0.0.1:${port}/manifest.webmanifest" | grep -q '"name": "Magium"'
http_get "http://127.0.0.1:${port}/not-a-real-route" | grep -q '<div id="app"></div>'
http_get "http://127.0.0.1:${port}/health" | grep -q '"status":"ok"'

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required for API validation" >&2
  exit 2
fi
api_404_body="$tmp_dir/api-404.json"
api_404_status="$(curl -sS -o "$api_404_body" -w '%{http_code}' \
  "http://127.0.0.1:${port}/v1/not-a-real-route")"
if [[ "$api_404_status" != "404" ]]; then
  echo "Unknown API route returned HTTP $api_404_status instead of 404" >&2
  exit 1
fi
grep -q '"error":"Not found"' "$api_404_body"

account_response="$(curl -fsS \
  -H 'content-type: application/json' \
  -d '{"username":"docker-validation","password":"docker-validation-password"}' \
  "http://127.0.0.1:${port}/v1/accounts/register")"
grep -q '"username":"docker-validation"' <<<"$account_response"
grep -q '"token":' <<<"$account_response"

docker rm -f "$run_container" >/dev/null
cleanup_containers=("${cleanup_containers[@]/$run_container}")
echo "Runtime image validation passed"

if [[ "$PUSH" != "1" ]]; then
  echo "Built and validated $VALIDATION_REF"
  echo "Run with --push, or pnpm docker:push-prod, to publish $TIMESTAMP_REF and $LATEST_REF"
  exit 0
fi

if [[ "$PLATFORM" != "$LOCAL_PLATFORM" ]]; then
  echo "Building and pushing $TIMESTAMP_REF and $LATEST_REF for $PLATFORM"
  docker buildx build \
    --pull \
    --target prod \
    --platform "$PLATFORM" \
    --push \
    -t "$TIMESTAMP_REF" \
    -t "$LATEST_REF" \
    .
else
  echo "Pushing $TIMESTAMP_REF"
  docker push "$TIMESTAMP_REF"
  echo "Pushing $LATEST_REF"
  docker push "$LATEST_REF"
fi

echo "Inspecting pushed tags"
docker buildx imagetools inspect "$TIMESTAMP_REF"
docker buildx imagetools inspect "$LATEST_REF"

echo "Published $TIMESTAMP_REF and $LATEST_REF"
