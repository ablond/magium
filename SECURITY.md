# Security Policy

## Supported Versions

Security fixes are handled on the `main` branch.

## Reporting A Vulnerability

Do not report vulnerabilities through public GitHub issues.

Email security reports to:

```text
perso@alexandre-blond.fr
```

Please include:

- a clear description of the issue;
- affected routes, files, or workflows;
- reproduction steps;
- impact and any known mitigation;
- whether a secret, save payload, or personal data may be involved.

If you suspect a credential or private token has been exposed, do not include
the raw secret in the report unless it is necessary for confirmation.

## Scope Notes

The playable runtime is client-side. Its anti-tamper design is intended to
detect and resist casual save manipulation, not to provide absolute protection
against a user who controls their browser and DevTools.
