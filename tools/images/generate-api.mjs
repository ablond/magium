import {
  generateBook1ImagesSync,
  prepareBook1ImageBatch,
  retrieveBook1ImageBatch,
  submitBook1ImageBatch,
} from "./manual-images.mjs";

const args = parseArgs(process.argv.slice(2));

try {
  if (args.book !== "1") {
    throw new Error("Only --book 1 is supported by the OpenAI image generation pipeline.");
  }

  if (args.retrieve) {
    const result = await retrieveBook1ImageBatch({
      batchId: args.batchId,
      runManifestFile: args.runManifest,
    });
    console.log(`Batch ${result.batch.id} status: ${result.batch.status}`);
    if (result.completed) {
      console.log(`Wrote ${result.written.length} generated WebP image(s).`);
      for (const file of result.written) console.log(`- ${file}`);
      if (result.failed) {
        console.log(`Batch also reported ${result.failed} failed request(s).`);
        console.log(`Error file: ${result.errorFile}`);
        console.log(`First error: ${result.errorSummary}`);
      }
    } else {
      console.log("Batch is not completed yet; rerun this command later with the same --batch-id and --run-manifest.");
    }
  } else if (args.sync) {
    const result = await generateBook1ImagesSync({
      momentId: args.moment,
      chapterId: args.chapter,
      all: args.all,
      missing: args.missing,
      quality: args.quality,
      size: args.size,
      referenceMode: args.referenceMode,
    });
    console.log(`Generated ${result.generated.length} Book 1 image(s) synchronously.`);
    for (const file of result.generated) console.log(`- ${file}`);
  } else {
    const prepared = await prepareBook1ImageBatch({
      momentId: args.moment,
      chapterId: args.chapter,
      all: args.all,
      missing: args.missing,
      quality: args.quality,
      size: args.size,
      referenceMode: args.referenceMode,
    });
    console.log(`Prepared ${prepared.requests} OpenAI Batch request(s) under ${prepared.outputRoot}`);
    console.log(`Batch input: ${prepared.batchFile}`);
    console.log(`Run manifest: ${prepared.runManifestFile}`);

    if (prepared.requests > 0 && !args.prepareOnly) {
      const submitted = await submitBook1ImageBatch({
        batchFile: prepared.batchFile,
        runManifestFile: prepared.runManifestFile,
      });
      console.log(`Submitted OpenAI Batch ${submitted.batch.id} with input file ${submitted.inputFile.id}.`);
      console.log("Retrieve later with:");
      console.log(`pnpm images:generate:api -- --book 1 --retrieve --batch-id ${submitted.batch.id} --run-manifest ${submitted.runManifestFile}`);
    } else if (args.prepareOnly) {
      console.log("Prepare-only mode: batch was not submitted.");
    }
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}

function parseArgs(argv) {
  const args = {
    book: "1",
    moment: "",
    chapter: "",
    all: false,
    missing: false,
    quality: "high",
    size: "1536x1024",
    referenceMode: "sheets",
    prepareOnly: false,
    sync: false,
    retrieve: false,
    batchId: "",
    runManifest: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--") continue;
    if (value === "--book") args.book = argv[++index] ?? "";
    else if (value === "--moment") args.moment = argv[++index] ?? "";
    else if (value === "--chapter") args.chapter = argv[++index] ?? "";
    else if (value === "--all") args.all = true;
    else if (value === "--missing") args.missing = true;
    else if (value === "--quality") args.quality = argv[++index] ?? "";
    else if (value === "--size") args.size = argv[++index] ?? "";
    else if (value === "--reference-mode") args.referenceMode = argv[++index] ?? "";
    else if (value === "--batch") args.sync = false;
    else if (value === "--sync") args.sync = true;
    else if (value === "--prepare-only") args.prepareOnly = true;
    else if (value === "--retrieve") args.retrieve = true;
    else if (value === "--batch-id") args.batchId = argv[++index] ?? "";
    else if (value === "--run-manifest") args.runManifest = argv[++index] ?? "";
    else throw new Error(`Unknown images:generate:api argument: ${value}`);
  }
  return args;
}
