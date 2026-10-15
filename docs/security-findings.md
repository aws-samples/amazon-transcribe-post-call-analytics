# Security findings and dispositions

Dependency vulnerability findings for this solution and what was decided about
each one. Update this file in the same change as any dependency bump, override,
or pin, so a reviewer can tell a deliberate decision from a stale version.

## Automated scanning (resolved)

Dependency scanning used to be entirely manual, which is how a 2022-era `requests` pin
and an end-of-support AWS SDK survived until someone went looking. Now:

- **`.github/dependabot.yml`** watches all four npm components, the GitHub Actions
  versions, and two pip directories, on a weekly schedule. `@aws-sdk/*` and `@smithy/*`
  are grouped so they arrive as one reviewable PR and move in lockstep, which is how
  they are released.
- **A `dependency-audit` CI job** runs `npm audit` across the four components as a
  matrix and fails the build on any finding in the **production** tree.

Two deliberate choices in that job, both of which matter:

**The gate is scoped with `--omit=dev`.** The web UI's full tree reports roughly 95
findings, effectively all rooted in `react-scripts` 5.0.1 - the final published
release, so they cannot be cleared by upgrading. A gate over the full tree would be red
permanently and would therefore be ignored, which is worse than having no gate. The
production tree is at zero across all four components, so this gate means something
today and will catch a regression immediately. The full tree is still printed to the
build log, un-gated, so the backlog stays visible.

**That scoping rests on dev dependencies not reaching production, and that was only
partly true when the gate was written.** `aws cloudformation package` zips the entire
`CodeUri` directory, `node_modules` included, so whatever `publish.sh` installs ships to
Lambda. With a plain `npm ci`, `pca-ui/src/lambda` was packaging the whole jest tree -
344 packages, 46 MB, carrying every one of the dev-only findings - into the deployed
function.

`publish.sh` and `publish-nokendra.sh` now use `npm ci --omit=dev` for the three
components whose directories become deployed artifacts (`pca-server/src/trigger`,
`pca-ui/src/lambda`, `pca-ui/src/witch`, the last because its build copies
`node_modules` into a layer zip). `pca-ui/src/www` keeps the full install because
`react-scripts` is a devDependency needed to produce the build, and only the resulting
`build/` directory is packaged.

`pca-ui/src/lambda` drops from 344 packages and 46.2 MB to 46 packages and 17.8 MB.
Verified all 22 handler modules still load with devDependencies omitted.

Two notes for anyone revisiting this:

- **If a handler ever needs a package at runtime, it must be a dependency, not a
  devDependency.** Prod-only installs now mean a misplaced entry fails in Lambda rather
  than working locally and in CI.
- The `*.test.js` files and the `jest/` directory still sit in `pca-ui/src/lambda` and
  are therefore still packaged. They are inert, and `cloudformation package` honours no
  ignore file, so excluding them would need a staging step. Not worth it for a few KB,
  but it is why the deployed artifact is not purely runtime code.

**`--registry=https://registry.npmjs.org` is passed explicitly and is not optional.**
Against a registry that does not implement the advisories endpoint, `npm audit` gets a
404 and reports **no findings rather than failing** - it exits 0 and the job goes green
having checked nothing. This is not hypothetical; it is what happened on the developer
machine used for this audit, where npm was pointed at an internal CodeArtifact mirror.

What Dependabot cannot see, and so still needs manual review:

- The **PyUtils layer** packages, pinned inside an inline `pip install` in
  `python-utilities.template` rather than a requirements file. There is no manifest to
  parse. The review procedure is below.
- The **ffmpeg binary**, pinned by URL and SHA256 in `build-ffmpeg-layer.sh`.
- **`submodule-mediasearch`**, owned by another repository.

## Build reproducibility (resolved)

`publish.sh` and `publish-nokendra.sh` used `npm install` at eight call sites. `npm
install` treats the lockfile as advisory - it will resolve a newer version satisfying a
caret range and rewrite `package-lock.json` while doing it - so a release build did not
necessarily ship the tree that had been reviewed or audited. All eight are now `npm ci`,
which installs exactly what the lockfile pins and fails when `package.json` and the
lockfile disagree. Verified all four lockfiles are in sync before making the change, so
the stricter command does not break the build.

Each call also gained `|| exit 1`. The previous `npm install` calls had none, so a
failed dependency install did not stop the build - it continued and packaged whatever
was on disk.

Related fixes made at the same time:

- **The Node floor is now 20, raised from 18.** The AWS SDK v3 packages declare
  `engines.node ">=20.0.0"`, and npm only *warns* on an engine mismatch rather than
  failing, so an 18 build would have installed and then misbehaved at runtime.
- **`publish-nokendra.sh` now has the version gate at all.** It previously had no npm
  or Node check, so the no-Kendra release path could be built on an unsupported
  toolchain silently.
- **CI moved from Node 14 to Node 20**, and from `npm i` to `npm ci`. Node 14 reached
  end of life in April 2023; after the SDK v3 migration that job could no longer even
  install. CI is pinned to 20 rather than 22 to match the floor `publish.sh` enforces,
  so CI exercises the oldest toolchain a release build will accept.
- **`actions/checkout@v2` and `actions/setup-node@v1` replaced with `@v4`.**

### Lockfile format drift

A committed `.npmrc` in each component pins `lockfile-version=2`. The lockfiles are
version 2, but npm 7 through 10 write version 3 by default, so without the pin the
format flipped depending on which npm a contributor happened to run - one routine
install rewrote 25,000 lines of `www`'s lockfile purely as a format migration, burying
the actual dependency change.

Note the file has to exist **per component**: npm resolves the project `.npmrc` from the
directory containing `package.json`, not by walking up to the repository root. Verified
empirically - from a component directory, a root `.npmrc` yields
`lockfile-version = null`. There is no `package.json` at the root, so a single shared
file is not an option.

Moving to version 3 is reasonable and probably desirable, but it should be a deliberate
standalone change rather than a side effect of someone's npm version.

## Reproducing the scan

The npm registry configured on a developer machine may be an internal mirror
that does not implement the advisories endpoint. `npm audit` returns HTTP 404
against such a mirror and reports **no findings rather than an error**, so it
silently appears to pass. Always pass the registry explicitly:

```
npm audit --package-lock-only --registry=https://registry.npmjs.org
npm audit --package-lock-only --omit=dev --registry=https://registry.npmjs.org
```

Run both. The second is the one that matters: it scopes the result to packages
that actually ship. The difference between the two is large here, because the
`react-scripts` build chain contributes most of the raw finding count and none
of the deployed exposure.

Python layer packages are not in any manifest (see below), so they must be
queried directly, for example against the OSV API by package and version.

## Node components

| Component | Ships as | Prod findings before | Prod findings after |
|---|---|---|---|
| `pca-ui/src/www` | Browser bundle | 9 | **0** |
| `pca-ui/src/lambda` | 22 API Lambdas | 3 | **0** |
| `pca-ui/src/witch` | Lambda layer | 2 | **0** |
| `pca-server/src/trigger` | Lambda | 2 | **0** |

Every deployed Node component now reports zero vulnerabilities.

Remediated:

- `axios` `^1.12.0` -> `^1.20.0`. Clears nine advisories. Also pulls `form-data`
  to 4.0.6 and `follow-redirects` to a patched version, both transitive via axios.
- `aws-sdk` **removed** from `pca-ui/src/www`. It was declared but imported
  nowhere in the web app; it contributed two findings and a large install tree.
  Verified by searching every file under `www` outside `node_modules` and `build`.
- `ajv` `^8.8.2` -> `^8.20.0` in `pca-ui/src/lambda`.
- `browserslist`, `@babel/core` and `@babel/helpers` updated in place.

### Disposition: scoped `path-to-regexp` overrides

`pca-ui/src/www/package.json` carries two **scoped** overrides. The scoping is
load-bearing and must not be collapsed into a single global override:

```json
"overrides": {
  "react-router": { "path-to-regexp": "^1.9.0" },
  "express":      { "path-to-regexp": "0.1.13" }
}
```

Two different major lines of `path-to-regexp` are in the tree, and each consumer
needs its own. `react-router` (via `react-router-dom` 5.3.0) requires `^1.7.0`;
`express` requires `0.1.x` and its router calls the 0.1.x signature. A global
`"path-to-regexp": "^1.9.0"` override collapses both onto 1.9.0, which removes
the nested copy express resolves and **breaks the dev server at runtime**.

Both advisories are cleared without the breaking `react-router-dom` v6 migration,
because each fix stays inside the major line its consumer expects.

### AWS SDK for JavaScript v2 (resolved)

`aws-sdk` and its pinned `uuid` 8.0.0 were not resolvable by a version bump: v2 reached
end-of-support on 2025-09-08 and receives no further security fixes, and
GHSA-j965-2qgj-vjmq names migration to v3 as the remedy.

Migrated in three increments - `pca-server/src/trigger`, `pca-ui/src/witch`, then
`pca-ui/src/lambda` (22 source files). v2 is now absent from every `package.json` and
every lockfile in the repository.

Note for anyone revisiting this: do **not** run `npm audit fix --force` against the v2
advisory. npm proposes `aws-sdk@1.18.0`, a downgrade to a 2013-era major, not a fix.

Going incrementally was worth it. Each component had at least one v2-only behaviour that
a find-and-replace would have shipped as a silent bug, and several would not have been
caught by any test:

- **Absent collections.** v2 normalised empty result sets into empty arrays; v3 omits
  the member. Affected `Items` in six query paths, `QueueConfigurations` in
  `bucket.js`, `LambdaFunctionConfigurations` in the trigger, and `events` in
  `input_bucket_trigger.js`. Each was a `TypeError` on an ordinary empty-result path -
  in `bucket.js` that meant a failed custom resource and therefore a failed stack.
- **`err.code` is not populated in v3**; it is `err.name`. Three sites used it for
  *control flow*. The worst was `role-seeder.js`, where it gated the retry that waits
  for the `custom:pca_role` schema attribute to propagate - it would have thrown on the
  first attempt and failed the whole deployment. In `users.js` and `delete.js` it
  would have turned intended 404s into 500s.
- **`Body` is a stream, not a Buffer.** Four `res.Body.toString()` sites. This one is
  nasty because it does not throw: it yields `"[object Object]"`, so the symptom is a
  JSON parse error with no connection to the SDK.
- **`getSignedUrl` became asynchronous.** Two synchronous assignments in `get.js` would
  have stored a Promise, which serializes to `{}` - silently breaking audio playback.
  The option also renamed from `Expires` to `expiresIn`, and in `presign.js` the old
  name would have been accepted as an unknown parameter while the URL fell back to the
  default 15 minute expiry, which coincidentally equals the 900 seconds intended.
- **`Limit` is no longer coerced.** `list.js` passes the query-string `count` straight
  through; v3 would have sent `"Limit": "25"` and DynamoDB would have rejected it.
- **`ddb.createSet()` and `s3.upload()` do not exist in v3**, replaced by a native
  `Set` and `PutObjectCommand` respectively.

### The lockout bug this migration would otherwise have introduced

Worth recording on its own, because it was the highest-risk change and it fails
silently and completely.

`auth-middleware.js` resolved permissions with
`Array.from(Permissions.values || Permissions)`, written against v2's DocumentClient,
which returned a String Set as `{ values: [...], type: 'String' }`. `lib-dynamodb`
unmarshalls the same attribute to a **native `Set`**, whose `.values` is a *function* -
truthy - and `Array.from` of a function yields `[]`.

Every user would have resolved to zero permissions and been denied every gated route.
Nothing throws, so the only symptom would have been blanket 403s after deployment.

Replaced with `toPermissionArray`, which handles the native Set, the v2 wrapper and a
plain array, so roles written before the migration keep working. It is unit tested
against all four shapes, and the test suite carries a negative control that asserts a
role lacking `read_calls` still receives 403 - without which a passing suite would not
prove authorization runs at all.

### Deferred: the `react-scripts` build chain

The web UI reports 95 findings with dev dependencies included and **0** with
`--omit=dev`. The remainder, including all four `critical` findings, come from
`react-scripts` 5.0.1 via `webpack-dev-server`, `express`, `postcss`, `svgo`
and the `jest` chain. Exposure is build-time and dev-server only.

`react-scripts` 5.0.1 is the final published release, so these cannot be cleared
by upgrading. The root causes are few - `postcss`, `webpack-dev-server`, `svgo`,
`serialize-javascript` - and most entries are npm propagating severity upward to
packages that merely depend on them rather than carrying an advisory themselves.

Resolving this requires either a growing set of overrides against an
unmaintained build tool, or migrating off Create React App. Deferred pending
that decision.

## Python: the PyUtils Lambda layer

`pca-server/cfn/lib/python-utilities.template` builds the layer by running `pip`
inside a custom-resource Lambda. **These packages appear in no `requirements.txt`,
so manifest-driven scanning will not see them.** Check them by hand.

Remediated - 11 CVEs:

| Package | Was | Now | Cleared |
|---|---|---|---|
| `requests` | 2.28.1 | 2.34.2 | CVE-2023-32681, CVE-2024-35195, CVE-2024-47081, CVE-2026-25645 |
| `urllib3` | `<2.0` (resolved 1.26.20) | 2.8.0 | CVE-2025-50181, CVE-2025-66418, CVE-2025-66471, CVE-2026-21441, CVE-2026-44431, CVE-2026-97687, CVE-2026-97689 |
| `filetype` | 1.0.13 | 1.2.0 | none outstanding; was three years stale |

### Disposition: why the `urllib3<2.0` cap was removed

The cap held the layer on 1.26.20, the final 1.x release. All seven urllib3 CVEs
above are fixed only in 2.x, so **while the cap stood none of them could be
remediated at all.**

The cap was needed for Lambda runtimes shipping OpenSSL 1.0.2, below urllib3
2.x's OpenSSL 1.1.1+ floor. Every template in this repo now declares
`python3.13`, so the constraint no longer applies.

The only direct `urllib3` consumer is `pca-server/src/llm/cfnresponse.py`, which
uses `urllib3.PoolManager()` and `http.request('PUT', url, headers=, body=)`.
Both are unchanged in 2.x. `requests` 2.34.2 accepts `urllib3` 2.x.

### Changing these versions again: two bumps are mandatory

The layer's content is addressed by its S3 key. Editing the pinned versions
changes the zip's *contents* but not its key, which CloudFormation sees as no
property change - so it publishes **no new layer version and the functions keep
running the old packages**, while the stack still reports `UPDATE_COMPLETE`.

Whenever the pinned versions change, also:

1. bump the `PyZipName` default (now `python-utils-layer-v3.zip`), and
2. bump the `Version` property on the `PyUtilsZip` custom resource (now `3`).

Confirm after deploying that the published `LayerVersion` number actually
incremented. Stack status alone does not tell you the layer was rebuilt.

Versions are pinned exactly rather than left as ranges, so the same template
cannot produce a different layer on a later deploy. That makes periodic review a
requirement, not an option.

## The ffmpeg binary

Remediated. Previously `pca-server/cfn/lib/ffmpeg.template` ran a custom resource that
downloaded a static ffmpeg tarball from a third-party website during stack creation, with
no checksum or signature verification (CWE-494), and the resulting binaries then parsed
user-uploaded media.

Three distinct problems, all now closed:

1. **No integrity verification.** Nothing checked what came back from the network.
2. **No reproducibility.** The effective URL pointed at an unversioned "latest release"
   path, so identical template code could deploy different binaries on different days.
3. **Plain HTTP.** The root templates overrode the inner default with an `http://` URL.
   It does 301 to HTTPS, so in practice the download completed over TLS, but an active
   on-path attacker can simply decline to redirect. The redirect was the only thing
   providing transport security, and a redirect is not a security control.

Worth recording because it was initially missed: the version actually deployed came from
the **root** templates (`pca-main.template`, `pca-main-nokendra.template`), which pinned
ffmpeg **4.4** over `http`. The `https` 7.0.2 default inside `ffmpeg.template` was dead,
because the root value always overrode it. When auditing a parameter threaded through
nested stacks, read the value at the top of the chain, not the default at the bottom.

### What replaced it

`pca-server/src/ffmpeg/build-ffmpeg-layer.sh` builds the layer at **publish** time:
it downloads over HTTPS, verifies the tarball against a pinned SHA256, extracts only
`ffmpeg` and `ffprobe`, and zips them as `bin/` so a layer unpacks them to `/opt/bin`
(already on the runtime PATH, which is what lets the Python code call them by bare name).

`publish.sh` and `publish-nokendra.sh` both invoke it, and `aws cloudformation package`
uploads the result to the per-region published-assets bucket like any other asset. The
custom resource, the nested `FFMPEG` stack and the `ffmpegDownloadUrl` parameter are gone.

Consequences worth knowing:

- **Failures moved to the right place.** A bad or unexpected download now breaks the
  release build in front of the person cutting the release, rather than a customer's
  stack creation.
- **A new binary now produces a new layer version.** `package` generates a
  content-addressed S3 key, so changed content changes the key. The old design used the
  fixed key `ffmpeg.zip`, which meant an updated binary was no CloudFormation property
  change at all and published no new layer version - the same trap documented above for
  the PyUtils layer.
- **No deploy-time internet egress** for these functions, which removes one of the two
  blockers to running them in private subnets.
- **Upstream pinning caveat.** ffmpeg 7.0.2 is only published at the unversioned path,
  because upstream's `old-releases` directory stops at 6.0.1. So that URL's contents will
  change when upstream next publishes, and the digest check will then fail the build
  deliberately, forcing a look at the new binary. Pin 6.0.1 from `old-releases` instead if
  a never-moving URL matters more than the newer build.
- **Layer size.** 58.9 MB compressed, 153 MB unpacked, against Lambda's hard 250 MB limit
  for function code plus all layers. The three consuming functions carry no other layer, so
  there is headroom, but a trimmed ffmpeg build would create more. Tracked as TD-1.

Choosing a better-maintained upstream, and the GPLv3 licensing of these builds, are
deliberately **not** addressed here. See TD-1 and TD-2 in `technical-debt.md`.

### Updating the pinned version

Change `FFMPEG_VERSION`, `FFMPEG_URL` and `FFMPEG_SHA256` in the build script together,
and record why here. Obtain the digest with `shasum -a 256` or `sha256sum`. Do not update
the digest to match a failing download before establishing why it changed - upstream
republishing and tampering look identical at that point.

For reference: 4.4 was `ccac14abf72e8a451d823ed09b1ea953b0bdf2814ab10fc153c753afd5fb0a20`,
7.0.2 is `abda8d77ce8309141f83ab8edf0596834087c52467f6badf376a6a2a4c87cf67`.

## Open items

Not addressed by the current change:

- **`submodule-mediasearch` is unscanned.** Pinned at commit `eba36ad3` and built
  by `publish.sh` on the Kendra path, but not initialized locally, so its
  dependency tree is unknown rather than clean.
- **`pca-utils/requirements.txt` is unpinned** (`boto3`, `pydub`, `streamlit`).
  Local helper only, not deployed, but an unpinned install is not auditable. Dependabot
  is configured for this directory, but it cannot propose updates against unpinned
  requirements - pinning them activates coverage.
- **`scottbrenner/cfn-lint-action@v2` pulls cfn-lint unpinned.** The lint gate can
  change behaviour without a commit to this repository. Tracked as part of TD-4.
- **Existing CloudWatch log groups still hold previously logged transcripts.** The code
  no longer logs them, but Lambda log groups created implicitly by the service never
  expire, so anything written before this change persists. Existing groups need review
  and an explicit retention period. Tracked under **TD-15**.
- **Four cfn-lint warnings remain**, reported but not gating the build: a `Ref` to a
  conditionally created bucket, four optional ARN parameters whose empty-string defaults
  do not match an ARN pattern, and a legacy S3 `AccessControl` property. Each needs a
  design decision. Tracked under **TD-4**.
- **IAM policy scoping has not been reviewed.** Several roles use broad managed
  policies - `AmazonS3FullAccess`, `AmazonTranscribeFullAccess` - and the layer-builder
  roles grant `s3:PutObject` on `arn:aws:s3:::${bucket}*`, where the wildcard is on the
  bucket *name* rather than the key. Not assessed in this work.
- **Unit tests are still packaged into the deployed Lambda artifacts.** `--omit=dev`
  prunes dependencies, not first-party source, so the 25 co-located `*.test.js` files
  ship. Not exploitable - no runner is present - but unnecessary. Tracked under
  **TD-18**.

Note on scope: the authorization model as a whole has **not** been reviewed. The swap
gap below was found incidentally while repairing unit test mocks, not by an audit, so
nothing here should be read as a statement that the remaining routes were examined and
found sound.

## Self-escalation via a user-writable role attribute (resolved)

Highest-severity finding in this release. **Confirmed against a deployed stack** (account
192084231224, `us-east-1`, stack `PCA`, 2026-10-14) before being fixed: originally
recorded as "possible, pending verification", every link in the chain was then checked
against live configuration.

**Fixed** by setting `WriteAttributes: [email]` on `PCAUserPoolClient`. The chain is
documented in full below because the fix is one line and its necessity is not obvious
from reading it.

### The chain

Three facts, each verifiable from the templates and source in this repository, and each
now confirmed on the deployed stack:

1. **`custom:pca_role` was user-writable.** `pca-ui/cfn/lib/cognito.template` declares it
   `Mutable: true`, and `PCAUserPoolClient` specified **no `WriteAttributes`**.

   This is the one link worth citing carefully, because the two AWS sources disagree in
   wording and the narrower reading would make the finding wrong. The `WriteAttributes`
   reference text - in both the API reference and the CloudFormation reference - says
   that when it is unspecified "your app can write the values of the **Standard
   attributes** of your user pool", which read literally would exclude a custom
   attribute. The app client developer guide is explicit and contradicts it, under
   *Considerations for attribute read and write permissions configuration*:

   > When you create an app client and don't customize attribute read and write
   > permissions, Amazon Cognito grants read and write permissions to all user pool
   > attributes.

   The developer guide is the correct reading, and it matches the long-standing console
   behaviour of pre-selecting every attribute including custom ones. Anyone re-checking
   this finding from the API reference alone will reach the opposite conclusion; that is
   why the quote is reproduced here.
2. **The token generator trusts the attribute verbatim.**
   `pca-ui/src/lambda/pre-token-generation.js` reads
   `event.request.userAttributes["custom:pca_role"]` and injects it straight into the
   access token. It performs no validation against the roles table.
3. **The entire authorization model trusts that claim.** Both `auth-middleware.js` and
   `pca_auth.py` read `custom:pca_role` from the authorizer claims and resolve it against
   the roles table. A caller presenting a token claiming `admin` is granted all four
   permissions.

Chained together: a user-writable attribute feeds a token claim which feeds every
authorization decision. If a user can write the attribute, they can self-assign `admin`
and obtain `manage_roles` and `delete_calls` - a full privilege escalation from the
default `call-readwrite` role that every self-signed-up user receives.

### Why the OAuth scope does not save it

Writing one's own attributes via `UpdateUserAttributes` requires an access token carrying
the `aws.cognito.signin.user.admin` scope. The client's `AllowedOAuthScopes` are only
`openid` and `profile`, so a token from the hosted UI OAuth code flow - the normal path
for this application - does not carry it. That was the one thing that might have held the
door shut.

It does not, because the hosted UI is not the only way to get a token.
`ExplicitAuthFlows` is **unspecified** on `PCAUserPoolClient` (confirmed: the deployed
client returns `null`), and the AWS documentation is explicit about what that means:

> If you don't specify a value for `ExplicitAuthFlows`, your app client supports
> `ALLOW_REFRESH_TOKEN_AUTH`, `ALLOW_USER_SRP_AUTH`, and `ALLOW_CUSTOM_AUTH`.

So `ALLOW_USER_SRP_AUTH` is live. Access tokens issued through the Cognito user pools
API - `InitiateAuth` with SRP, bypassing the hosted UI entirely - carry
`aws.cognito.signin.user.admin` automatically, regardless of the client's configured
OAuth scopes. A user authenticates directly against the user pool, receives a token with
that scope, and can then write their own attributes.

Confirmed on the deployed stack:

| Property | Deployed value | Consequence |
|---|---|---|
| `custom:pca_role` `Mutable` | `true` | attribute can be changed after creation |
| `custom:pca_role` `DeveloperOnlyAttribute` | `false` | not restricted to admin APIs |
| client `WriteAttributes` | `null` | default applies: all mutable attributes user-writable |
| client `ExplicitAuthFlows` | `null` | default applies: `ALLOW_USER_SRP_AUTH` enabled |
| `PreTokenGenerationConfig.LambdaVersion` | `V2_0` | trigger active, injects the attribute |
| `AdvancedSecurityMode` | `ENFORCED` | does not restrict attribute writes; no mitigation here |

The exploit itself was **not** performed - it would require mutating a user's attributes
in a live account, and the configuration is conclusive without it.

### Who can exploit it depends on one deployment parameter

In the stack inspected, `AdminCreateUserConfig.AllowAdminCreateUserOnly` is `true`, so
self-signup is closed and an attacker must already be a provisioned PCA user. The
escalation is therefore from the default `call-readwrite` role to `admin` - gaining
`delete_calls` and `manage_roles` - by someone who already has an account.

**That bound is not a property of the solution, it is a property of one parameter.**
`cognito.template` sets it conditionally:

```yaml
AllowAdminCreateUserOnly: !If
  - ShouldAllowSignUpEmailDomain
  - false
  - true
```

Any deployment that sets `AllowedSignUpEmailDomain` turns self-signup **on**. In that
configuration anyone with an email address at the permitted domain can self-register,
receive the default `call-readwrite` role, and escalate to `admin`. For a corporate
deployment scoped to a company domain, that is every employee.

### The fix

`PCAUserPoolClient` now declares:

```yaml
WriteAttributes:
  - email
```

`custom:pca_role` is absent from that list, so no access token issued for this client -
through any flow, carrying any scope - authorizes a user to write it. The capability is
removed rather than being made dependent on a scope staying absent, which is why this was
preferred over tightening `AllowedOAuthScopes` or `ExplicitAuthFlows`.

Why `email` and nothing else:

- It is `Required: true` in the pool schema, and Cognito requires an app client to hold
  write access to required attributes. Omitting it would break `SignUp` on the
  self-signup path, which is precisely the configuration most exposed to this finding.
- Nothing else needs it. No code in this solution makes a user-scoped
  `UpdateUserAttributes` call - `pca-ui/src/www` only exchanges an authorization code at
  `/oauth2/token` and refreshes tokens, and a repository-wide search for a user-scoped
  attribute write returns nothing.

**Role assignment is unaffected.** `cognito-default-role.js` (the PostConfirmation and
PostAuthentication trigger), `role-seeder.js` (the admin bootstrap custom resource) and
`users.js` (the `manage_roles` API) all write `custom:pca_role` with
`AdminUpdateUserAttributes` under IAM credentials. Admin API calls are not constrained by
a client's `WriteAttributes`.

`ReadAttributes` was deliberately left unspecified. Read is not the finding - a user
seeing their own role is harmless, and the access token already carries it - while
restricting it would change what the ID token and the `userInfo` endpoint return under
the `profile` scope, for no security gain.

Deployment impact is nil: `WriteAttributes` is *Update requires: No interruption*, so the
client ID is preserved and the web app's baked-in configuration keeps working. Verified
`cfn-lint --non-zero-exit-code error` still exits 0 with no new warnings.

### Not done, and deliberately

Two further hardening steps were considered and left out rather than bundled in.

- **Validate the attribute in `pre-token-generation.js`.** Resolving `custom:pca_role`
  against the roles table at token issuance, and falling back to the default role when it
  names a role that does not exist, would remove "the token claim is authoritative
  because the attribute is" from the design entirely. Worth doing as defence in depth, at
  the cost of a DynamoDB lookup per token issuance. Not required now that the attribute
  cannot be user-written.
- **Restricting `ExplicitAuthFlows`.** Dropping `ALLOW_USER_SRP_AUTH` would also have
  blocked the token that carried `aws.cognito.signin.user.admin`, and the web app would
  not notice - it uses only the hosted-UI code grant and the refresh-token grant. It was
  not applied because it could not be confirmed that managed login itself is unaffected
  by that property, and an incorrect answer locks every user out of the application.
  `WriteAttributes` achieves the same outcome with a failure mode that is understood.

## GenAI endpoint authorization (resolved)

`GET /genaiquery` and `GET /genai/refreshsummary` performed **no authorization at all**.
The API's Cognito authorizer was the only control, so any authenticated user could reach
them regardless of role - including a user whose role granted nothing. Both act on a
caller-supplied `filename`.

Concretely, before this change: `genaiquery` fetched any call's transcript and returned a
model response derived from it, so a prompt such as "repeat the transcript verbatim" made
it a disclosure path rather than merely a summarizer; and `refresh_summary` invoked the
summarizer on an arbitrary filename, overwriting the stored summary and spending a model
invocation per call.

Both now require **`read_calls`**, enforced by `pca-ui/src/genai/pca_auth.py` - a port of
`auth-middleware.js` that reads `custom:pca_role` from the authorizer claims, resolves it
against the same roles table, and fails closed on every path: missing identity, missing
role claim, unconfigured table, role absent, or a DynamoDB error. Denials are written to
the audit log group as `AUTH_DENIED` with a `reason`, so a misconfiguration is
distinguishable from a genuine refusal. IAM is scoped to `dynamodb:GetItem` on the roles
table rather than a blanket read policy.

`read_calls` is consistent with the decision recorded below for `PUT /swap/{key+}`.
Note that `refresh_summary` mutates stored data, so if an `edit_calls` permission is ever
introduced it is the first call site that should move to it.

### The transcript was being read even when the feature was disabled

Separate from authorization, and fixed at the same time. The handler fetched the
transcript *before* consulting `QUERY_TYPE`:

```python
transcript_str = get_transcript_str(filename)   # unconditional

if QUERY_TYPE == 'ANTHROPIC': ...
else:
    query_response = 'Query response disabled.'
```

So "disabled" suppressed the model call but never the transcript retrieval - and the
transcript was then logged. The check now happens first and returns before reading
anything.

### Debt this created

The permission model now exists in two languages with no shared layer. A change to it has
to be made in both `auth-middleware.js` and `pca_auth.py`, and the two can drift. That is
documented at the top of `pca_auth.py`. If a third runtime ever needs this, the answer is
to extract a service, not to port it again.

Also note `pca_auth.py` deliberately does **not** consult `PERMISSION_MAP`, and the GenAI
routes remain absent from it. An entry there would be inert while reading as coverage,
which is exactly how `GET /genaiquery` previously appeared protected when it was not.

## Transcripts in CloudWatch Logs (resolved)

Nine sites logged whole call payloads. The significant one was
`pca-server/src/pca/pca-aws-fetch-transcript.py`, a step in the main processing workflow,
which printed the full transcript of **every** ingested call regardless of any GenAI
setting. All now log identifiers, counts and lengths instead.

`print(event)` calls became projections rather than being removed, because the raw events
carry things that should not be in logs: Cognito identity claims on the API handlers, the
user's free-text query on `genaiquery`, and a pre-signed `ResponseURL` plus full prompt
template text on the `llm_prompt_upload` custom resource.

**What this does not fix.** Lambda log groups created implicitly by the service never
expire, so transcripts logged before this change are still there. Existing groups need
review and an explicit retention period. Only three groups in the solution declare one:
`/pca/apigateway` (90 days), `/pca/audit` (`AuditLogRetentionDays`, 365 on the stack
checked), and the three Cognito helper functions in `cognito.template`
(`CloudWatchLogsExpirationInDays`). Every other function log group - including all the
API handlers and the whole `pca-server` workflow, which is where transcripts landed - is
created implicitly by Lambda with no retention. Verified on the live stack: those groups
report `retentionInDays: null`. A CloudWatch Logs data
protection policy with managed PII identifiers would add defence in depth against a future
careless `print`, though it masks known patterns rather than free-form conversation and so
is not a substitute for not logging content.

## Decision: `read_calls` governs speaker swap

Recorded because the choice is deliberately not the obvious one, and because the code
alone cannot explain why a read permission authorizes a write.

`PUT /swap/{key+}` requires **`read_calls`**.

Swap rewrites caller/agent sentiment records in DynamoDB and the `SpeakerLabels`
display text in the call's S3 JSON, so it is unambiguously a mutation. Gating a
mutation on a read permission is a conscious exception, taken on the grounds that
swapping speaker attribution is a **correction to a call you can already see** rather
than a new capability over it. Requiring `delete_calls` - the only existing permission
covering changes to an existing call - would mean granting deletion rights to anyone
who needs to fix a mislabelled speaker, which over-grants a far more destructive
action to accomplish a routine data-quality task.

What this does and does not achieve:

- **It closes the actual hole.** Before this change `swap.js` was not wrapped at all
  and the route was unmapped, so a user with *no* `read_calls` - an upload-only or
  `manage_roles`-only role - could call the endpoint directly and mutate a call they
  could not even view.
- **It does not restrict who can swap among users who can already read calls.** Both
  seeded roles (`admin` and the default `call-readwrite`) hold `read_calls`, so in
  practice anyone who can open a call can re-attribute its speakers. That is the
  intended reading of the decision, not an oversight.

The residual risk is therefore that `read_calls` confers one specific write. It is
bounded: the only mutation it permits is swapping two speaker labels, the operation is
idempotent in effect and trivially reversible by swapping back, and it is now recorded
in the audit trail as `CALL_SPEAKERS_SWAPPED` with the acting username.

### If finer granularity is needed later, add `edit_calls`

Should it become necessary to separate "may correct call data" from "may view call
data", the recommended approach is a new **`edit_calls`** permission rather than
reusing `delete_calls`:

- It names the capability accurately and extends to any future operation that modifies
  an existing call, of which swap is currently the only one.
- It separates correction from destruction, so a reviewer role can be granted the
  ability to fix attribution without also being able to delete recordings.
- Moving from `read_calls` to `edit_calls` is a **widening** - roles gain a permission
  they did not have - which is the safer migration direction. Choosing `delete_calls`
  now and relaxing later would be a narrowing, and narrowings break working
  deployments.

Three things that work needs to account for:

1. **`role-seeder.js` only runs on `RequestType === "Create"`.** A stack *update* will
   not add a new permission to any existing role, including `admin`. Swap would
   silently stop working for everyone until an administrator ticked the new permission
   on each role. Either extend the seeder to add the permission on update - using an
   `ADD` update expression so it does not overwrite customized roles - or accept and
   document the manual step.
2. **The permission list is hardcoded in two places**: `VALID_PERMISSIONS` in
   `pca-ui/src/lambda/roles.js` and `ALL_PERMISSIONS` in
   `pca-ui/src/www/src/routes/RoleManagement.js`. Both must change together or the UI
   and the API will disagree about what is valid.
3. **`refresh_summary` is the stronger argument for `edit_calls` than swap is.** It
   regenerates and overwrites a stored summary, so if that endpoint is given
   authorization as part of TD-16, decide `edit_calls` at the same time and apply it to
   both rather than introducing the permission twice.

## Pre-existing test failures (resolved)

`pca-ui/src/lambda` had 3 test suites, 2 of which failed on a clean checkout with
`TypeError: AWS.CloudWatchLogs is not a constructor`. The `jest.mock("aws-sdk")`
factories in `list.test.js` and `validation.test.js` provided only `DynamoDB` and `S3`,
but `list.js` and `search.js` are wrapped in `withAuthorization`, which pulls in
`auth-middleware.js` -> `audit.js`, and those construct `new AWS.DynamoDB.DocumentClient()`
and `new AWS.CloudWatchLogs()` at module load. The suites failed during import, before
any test body ran.

Confirmed unrelated to the dependency work: the same two suites failed identically with
`ajv` pinned back to 8.8.2.

Fixed to establish a baseline before the AWS SDK v3 migration. Two things were wrong,
not one - supplying `CloudWatchLogs` alone just moves the error to `DocumentClient`,
because `audit.js` is required on the line above the `DocumentClient` construction.

The suites were also **semantically** stale, which the missing mocks were hiding.
`validation.test.js` events carry `httpMethod: "GET"` and `resource: "/search"`, which
maps to `read_calls`, so authorization runs for real; with the mocks merely repaired
both tests returned 403 rather than the expected 200 and 422. They now supply the access
token claims that the Cognito Pre Token Generation trigger injects in production. Those
tests were written before RBAC existed and had never been updated.

Now 3 suites, 5 tests, green. Verified the tests pass for the right reasons rather than
by bypassing authorization: changing the mocked role's permission to a wrong value makes
both return 403, confirming the authorization path is genuinely exercised.

These mocks target AWS SDK v2 and will be rewritten by the v3 migration. That was a
known and accepted cost - a refactor of 19 handlers with no runnable tests was the larger
risk.

## Validation against a live deployment

Recorded because much of this document was written from source and templates alone. On
2026-10-14 the remediated solution was deployed by the repository owner (account
192084231224, `us-east-1`, root stack `PCA`, `CREATE_COMPLETE`) and the assertions above
were checked against it with read-only API calls. Nothing was mutated and no exploit was
run.

### Confirmed as documented

| Assertion | Evidence from the deployed stack |
|---|---|
| The ffmpeg custom resource and its download parameter are gone | `ffmpegDownloadUrl` absent from the root stack's parameters; no `FFMPEG` nested stack (nested set is `LLMPromptConfigure`, `PCAServer`, `PCAUI`, `PcaDashboards`, `PythonUtilsLayer`, `SSM`) |
| The layer now comes from the publish-time build, not a runtime download | `FFMPEGLayer` version 4 reports `CodeSize` 58,935,094 bytes - **byte-identical** to the zip produced locally by `build-ffmpeg-layer.sh` from the pinned 7.0.2 tarball |
| The layer targets the expected runtime | `CompatibleRuntimes: [python3.13]`, `CompatibleArchitectures: [x86_64]` |
| The support bucket carries only the PyUtils artifact | `pca-supportfilesbucket-xko0ehwussy1` contains exactly one object, `python-utils-layer-v3.zip` (3,337,524 bytes) - the `v3` rename took effect and no stale `v2` object lingers |
| `new Set()` marshals as a DynamoDB string set, matching what `toPermissionArray` reads | Roles table rows `admin` and `call-readwrite` store `Permissions` as `SS`, with `L` null |
| The GenAI authorizer is wired up | `GenAIQueryFunction` environment carries `RolesTableName`, `AuditLogGroupName` and `QUERY_TYPE`; layer `PyUtilsLayer:4` attached |
| IAM for the GenAI function is scoped, not blanket | Statement Sids on its role: `InvokeGetTranscript`, `DynamoDBAccess`, `InvokeBedrock`, `BedrockGetInferenceProfile`, `RolesTableRead`, `CloudWatchLogsAudit` |
| `npm ci --omit=dev` actually changed what ships | Deployed `ListFunction` package (5,870,229 bytes, 5,752 entries) contains 0 `jest`, 0 `aws-sdk-client-mock` and 0 `@babel` entries, against 3,435 `@aws-sdk` entries |
| Lambda log groups never expire | The implicitly created function groups all report `retentionInDays: null` |

### Corrections the validation forced

Two statements in earlier revisions of this document were wrong, both for the same
reason - an inner nested-template parameter default was read as if it were the effective
value, when the root template always overrides it.

- **`GenAIQuery` defaults to `BEDROCK`, not `DISABLED`.** The claim that conditioning
  `GenAIQueryFunction` "closes the exposure for default deployments" was false: a stock
  deployment has GenAI query enabled. Corrected here, in `technical-debt.md` (TD-16) and
  in `CHANGELOG.md`. The deployed function confirms it with `QUERY_TYPE: BEDROCK`.
- **Three function log groups do declare retention** - the Cognito helpers in
  `cognito.template` - and `/pca/audit` sets 365 days on this stack. The original "the
  function log groups set nothing" was too broad, though it holds for every group that
  transcripts were actually written to.

`ffmpegDownloadUrl` was the first instance of this mistake and TD-17 already warns
against it. It recurring inside the same release is the strongest argument for the
root-to-leaf parameter review that TD-17 asks for.

### Still true after deployment

- **The Cognito escalation chain was real.** The deployed configuration confirmed every
  link, which is what moved it from "possible" to confirmed and justified fixing it in
  this release. Now closed by `WriteAttributes` - see the section above. The deployed
  stack still carries the vulnerable client configuration until it is updated.
- **Test files still ship.** The `ListFunction` package contains 25 `*.test.js` entries.
  They are the handlers' own co-located tests, not a dependency, so `--omit=dev` cannot
  remove them. Harmless on their own - no test runner is present to execute them - but
  they are dead weight in the artifact and should be excluded by the packaging step.
- **Log groups from an earlier stack survive.** Groups named for a previous UI stack
  (`PCA-PCAUI-DDKU50P6PL8`) sit alongside the current ones. Transcripts logged before
  the PII fix are in them, with no expiry. This is exactly the residue TD-15 describes,
  observed rather than predicted: a stack replacement leaves its log groups behind.
