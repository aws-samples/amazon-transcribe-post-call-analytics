# Technical debt backlog

Non-security issues found while auditing dependencies for the CVE remediation.
Deliberately **out of scope** for that security-focused change and parked here
for a later release.

Security findings and their dispositions live in `security-findings.md`. A few
items below touch security indirectly; where that happens the entry says so and
cross-references. Nothing here is an active exploitable vulnerability.

Effort is a rough order of magnitude, not an estimate.

---

## TD-1: Replace the ffmpeg binary source

**Theme:** supply chain / maintenance | **Effort:** days | **Priority:** high

`pca-server/src/ffmpeg/build-ffmpeg-layer.sh` sources its static ffmpeg and
ffprobe binaries from `johnvansickle.com`, a personal website.

The *integrity* problem is now fixed - the download is pinned and SHA256-verified
at publish time (see `security-findings.md`). This entry is about the remaining
question of whether that should be the upstream at all, which the verification
work deliberately left alone. The source is a maintenance liability:

- **It is effectively dormant.** The "latest release" tarball has a
  `Last-Modified` of 2024-08-24 and contains ffmpeg 7.0.2. Upstream ffmpeg is
  now at 9.0.2, with 8.1.x also maintained. The solution is roughly two major
  versions and two years behind, and waiting for this source to update has not
  worked.
- **Pinning a version is not actually possible.** The `old-releases/` directory
  carries versioned tarballs only up to 6.0.1. The 7.0.2 build in use exists
  *only* behind the floating `ffmpeg-release-amd64-static.tar.xz` URL, so there
  is no stable URL for the version actually deployed.
- **Only an MD5 digest is published.** No SHA256, no signature. MD5 is adequate
  for spotting a truncated download and inadequate as an integrity control.
- **Licensing is likely wrong for this solution.** The build's own readme states
  it is licensed under **GPL v3**. This repository ships under Apache 2.0.
  Bundling a GPLv3 binary into a deployed artifact deserves a deliberate
  decision rather than an inherited default.
- **Single point of failure.** One individual's web host, no mirror, no CDN.
  Less severe since the artifact moved to publish time - if the host goes away it
  breaks the release build rather than every customer deployment - but it still
  means a release cannot be cut until someone picks a new source under pressure.

Candidate replacements, to be evaluated rather than assumed:

| Option | Notes |
|---|---|
| `BtbN/FFmpeg-Builds` | De-facto community standard. Daily automated linux64 builds published as versioned GitHub releases with a `checksums.sha256` file. Offers both GPL and **LGPL** variants, so the licensing issue above is addressable. Still a third party, but versioned, checksummed and actively maintained. |
| Build from source in CI | Maximum control and reproducibility, and lets the codec set be trimmed to what is actually used. Highest ongoing cost. |
| Drop to a minimal codec set | The solution only needs audio demux/decode plus MP3 encode. The current build carries a large surface, including image and video decoders that user-supplied media can reach. A narrower build is a smaller attack surface as well as a smaller artifact. |
| Remove ffmpeg where possible | See TD-2. |

Changing source is now cheap, which is the point of having done the plumbing
first: the download, digest and extraction all live in one script, and the
artifact is already mirrored into the solution's own published assets. Swapping
upstream means editing three constants and the extraction paths in
`build-ffmpeg-layer.sh` - no template change, no new parameters.

Note that BtbN's archives use a different top-level directory layout, so the
`tar --strip-components` invocation and the archive-layout guard in that script
will need adjusting. Keep the output zip laid out as `bin/ffmpeg` and
`bin/ffprobe`, since that is what puts them on the Lambda runtime PATH.

## TD-2: Re-evaluate whether ffmpeg is needed at all

**Theme:** architecture | **Effort:** days to weeks | **Priority:** medium

ffmpeg is used for only two things:

1. **Metadata probing** - `ffprobe` reads channel count, sample rate and format
   in `pca-aws-sf-start-transcribe-job.py`, `pcacommon.py` and
   `pca-aws-sf-extract-transcript-header.py`.
2. **MP3 transcoding** - `pca-aws-sf-process-turn-by-turn.py` converts source
   audio so the HTML5 `<audio>` element can play it back.

Both may have managed alternatives. Amazon Transcribe already reports some of
the stream characteristics being probed, and AWS Elemental MediaConvert is a
managed path for the transcode. If the probing can be satisfied from Transcribe
output and the transcode moved to a managed service, the binary dependency and
everything in TD-1 disappears.

Worth a spike before investing in TD-1. Note the trade: MediaConvert adds
per-minute cost where ffmpeg-in-Lambda is effectively free, so this is a cost
and latency decision, not purely a maintenance one.

## TD-3: Two of three Lambda unit test suites fail on a clean checkout (resolved)

**Theme:** test health | **Effort:** done | **Priority:** n/a

> Fixed to establish a green baseline before the AWS SDK v3 migration. Now 3 suites,
> 5 tests, passing. Two separate faults, described below and in
> `security-findings.md`: the missing mock clients, and - hidden behind them - test
> events that predated RBAC and would have returned 403. Note these mocks target
> SDK v2 and will be rewritten by the migration; that cost was accepted, since
> refactoring 19 handlers with no runnable tests was the larger risk.

In `pca-ui/src/lambda`, `list.test.js` and `validation.test.js` both fail with
`TypeError: AWS.CloudWatchLogs is not a constructor`. Their
`jest.mock("aws-sdk")` factories return only `DynamoDB` and `S3`, but
`search.js` -> `auth-middleware.js` -> `audit.js` constructs
`new AWS.CloudWatchLogs()` at module load, so the suites die during setup before
any test body runs. The mocks were never updated when audit logging was added.

Confirmed pre-existing and unrelated to any dependency change: the same two
suites fail identically with `ajv` pinned back to its original 8.8.2.

This means the CI `api-tests` job cannot be passing on `main`. Fix the mocks
before or alongside the CI work in TD-4, otherwise repairing CI just surfaces a
red build with no owner. The AWS SDK v3 migration will rewrite these mocks
anyway, so sequence accordingly.

## TD-4: CI is stale and both jobs appear to be failing (resolved)

**Theme:** build and CI | **Effort:** done | **Priority:** n/a

> Resolved. Node 14 to 20, `npm i` to `npm ci`, `actions/checkout@v2` and
> `actions/setup-node@v1` to `@v4`, and cfn-lint pinned to 1.46.0 via pip instead of
> pulling "Latest Version" through a third-party action.
>
> Both jobs now pass. `api-tests` was fixed by TD-3. `cfn-linter` needed two things: the
> three `E0000` duplicate-key errors in `pca-main.template` removed (TD-5), and
> `--non-zero-exit-code error` so the job gates on errors while still printing warnings.
> Without the second, that job could **never** have passed - cfn-lint exits 4 on
> warnings and any non-zero exit fails a step, so it was red from the day the first
> warning appeared, independently of the duplicate keys.
>
> Removing the duplicate keys also unmasked two warnings in that template (W1020, W8001,
> both now fixed): cfn-lint stops deeper analysis of a template once it hits a
> parse-level error, so those findings had been hidden rather than absent.
>
> Four warnings remain, reported and not gated: W1001 (a `Ref` to a conditionally
> created bucket), W1030 x4 (optional ARN parameters whose empty-string defaults do not
> match an ARN pattern), W3045 (a legacy S3 `AccessControl` property) and W1028 (a
> vacuous finding explained inline in `api.template`). Each needs a real design decision
> rather than a quick edit.

`.github/workflows/ci.yml`:

- Uses `actions/checkout@v2` and `actions/setup-node@v1`, both long deprecated.
- Pulls cfn-lint at "Latest Version" with no pin, so the lint gate can change
  behaviour without a commit to this repository.
- The `cfn-linter` job runs `cfn-lint`, which currently reports `E0000` errors
  (see TD-5), so that job should be red.
- The `api-tests` job runs the suites in TD-3, so that job should be red too.

The Node version pin in this workflow is tracked in `security-findings.md`
instead, since running an end-of-life runtime is a security concern.

A green, trustworthy CI run is a prerequisite for most other work here.

## TD-5: Duplicate keys in `pca-main.template` (resolved)

**Theme:** correctness | **Effort:** done | **Priority:** n/a

> Resolved as a prerequisite for TD-4 - the `cfn-linter` job could not pass while these
> errors existed. Both `QueryCapacityUnits` and `StorageCapacityUnits` were declared
> twice with **byte-identical** definitions, so there was no "which value was intended"
> question: the second pair was removed. `pca-main-nokendra.template` does not declare
> these parameters at all, so it was unaffected.

cfn-lint reports genuine `E0000` duplicate-key errors:

```
E0000 Duplicate found 'QueryCapacityUnits'    pca-main.template:331
E0000 Duplicate found 'QueryCapacityUnits'    pca-main.template:351
E0000 Duplicate found 'StorageCapacityUnits'  pca-main.template:361
```

In YAML a later duplicate key silently wins, so one of each pair is dead and the
effective value may not be the intended one. Worth confirming which value is
actually desired rather than simply deleting a line.

## TD-6: cfn-lint does not cover every template

**Theme:** build and CI | **Effort:** hours | **Priority:** medium

`.cfnlintrc.yaml` lints `pca-server/cfn/**`, `pca-ssm/cfn/**`, `pca-ui/cfn/**`
and `pca-main.template`. It therefore skips:

- `pca-main-nokendra.template`
- `pca-dashboards/`
- `pca-observability/`
- `pca-samples/`

`pca-main-nokendra.template` is a deployment entry point, so excluding it from
the lint gate is the most consequential gap. Expect new findings when the scope
is widened; budget for fixing them rather than just flipping the config.

## TD-7: Build scripts are not reproducible (resolved)

**Theme:** build and CI | **Effort:** done | **Priority:** n/a

> Resolved. All eight `npm install` call sites are now `npm ci`, each with `|| exit 1`
> (they previously had no failure check at all). Lockfile format pinned to version 2 via
> a committed `.npmrc` in each of the four components - it has to be per component,
> because npm resolves the project `.npmrc` from the directory containing `package.json`
> rather than walking up to the repository root. Verified all four lockfiles were in sync
> before switching, so the stricter command does not break the build.
>
> Also raised the Node floor from 18 to 20, since the AWS SDK v3 packages declare
> `engines.node ">=20.0.0"` and npm only warns on a mismatch, and added the version gate
> to `publish-nokendra.sh`, which had none. Details in `security-findings.md`.
>
> Migrating the lockfiles to version 3 remains an option, deliberately not taken here -
> it should be its own change rather than a side effect.

`publish.sh` and `publish-nokendra.sh` use `npm install` rather than `npm ci` at
eight call sites, so lockfiles are advisory and a release build can resolve
different transitive versions than were tested. Cross-referenced in
`security-findings.md`, since it means the audited tree is not necessarily the
shipped tree.

Related: **lockfile format drift.** These lockfiles are `lockfileVersion: 2`, and
npm 11 silently rewrites them to version 3 on any write. Without a deliberate
choice, the format flips depending on which npm a contributor happens to run,
producing enormous spurious diffs. Either commit to version 3 as its own change,
or pin `lockfile-version=2` in a committed `.npmrc`.

## TD-8: The two publish scripts have diverged (partially resolved)

**Theme:** build and CI | **Effort:** hours | **Priority:** medium

The specific instance is fixed: `publish-nokendra.sh` had no npm or Node version
check, so the no-Kendra release path could be built on an unsupported toolchain
silently. Both scripts now enforce the same Node 20 floor and the same `npm ci`
behaviour.

**The underlying cause remains.** The two publish scripts and the two
`pca-main*.template` files are near-duplicates maintained by hand, which is why
they drifted in the first place - and every change in this release had to be
applied twice, which is exactly the failure mode. Factoring out the shared logic
is the real fix; patching each divergence as it is noticed only works for as long
as someone keeps noticing.

## TD-9: Dead and misleading dependency manifests

**Theme:** maintainability | **Effort:** hours | **Priority:** low

- `pca-server/src/pca/requirements.txt` pins `boto3==1.34.101`, but `publish.sh`
  has the `pip install -r requirements.txt` step commented out. The functions run
  against the boto3 baked into the Lambda runtime, so this file documents a
  version that is never installed. Either wire it up or delete it and say in a
  comment that boto3 comes from the runtime.
- `pca-server/src/pca/six.py` is a vendored copy of `six` 1.16.0. No CVE, but a
  vendored library is invisible to dependency scanning, which is exactly the
  blind spot the PyUtils layer already demonstrated. Prefer a declared
  dependency, or drop it - `six` exists for Python 2 compatibility and this
  runtime is 3.13.
- `pca-server/src/pca/__pycache__/*.cpython-310.pyc` are committed build
  artifacts, compiled under Python 3.10 while every template declares 3.13.
  Delete and add to `.gitignore`.
- `pca-utils/requirements.txt` lists `boto3`, `pydub` and `streamlit` with no
  version constraints at all. Local helper only, not deployed, but an unpinned
  install is not reproducible or auditable.

## TD-10: Fragile and dated frontend dependency declarations

**Theme:** maintainability | **Effort:** varies | **Priority:** low to medium

- **`"react-bootstrap": "^2.0.0-rc.0"`** in `pca-ui/src/www/package.json` is a
  caret range on a *release candidate*. It floats across the entire 2.x line,
  including future majors of the pre-release series. Pin it to a stable release.
- **React 17** while React 19 is current. Not urgent on its own, but
  `react-router-dom` is also on v5, and the v6/v7 migration is what would let
  the scoped `path-to-regexp` override in `security-findings.md` be removed.
  Sequence this with the Create React App to Vite migration so the toolchain and
  the framework move once rather than twice.
- **Unused imports and variables** across `src/App.js`,
  `src/components/ContactTable.js` and `src/components/Upload.js` produce eslint
  `no-unused-vars` warnings on every build. Harmless, but they train readers to
  ignore build output, which is how real warnings get missed.

## TD-11: Deploy-time internet egress blocks network isolation

**Theme:** architecture | **Effort:** days | **Priority:** medium

**One of two now resolved.** The ffmpeg download moved to publish time, so it no
longer reaches the internet during stack creation.

The remaining one is `python-utilities.template`, whose custom resource runs
`pip install` from PyPI while the stack is being created.

That function is not VPC-attached today, so nothing is currently broken. But if
it is ever placed in a private subnet - the usual posture for this kind of
workload - it will fail, because PyPI is not reachable through a VPC endpoint
(short of a CodeArtifact PyPI mirror plus its interface endpoint). Any plan to
isolate this solution's compute has to deal with it.

The ffmpeg layer shows the shape of the fix: build the artifact at publish time
and ship it as a published asset, letting `aws cloudformation package` upload it.
The PyUtils layer is a better candidate still, since its contents are three
pinned pip packages rather than a 150 MB binary. Doing so would also retire the
`PyZipName`/`Version` double-bump trap documented in `security-findings.md`,
because a content-addressed key makes changed content a new layer version
automatically.

## TD-12: No automated dependency maintenance (resolved)

**Theme:** build and CI | **Effort:** done | **Priority:** n/a

> Resolved. `.github/dependabot.yml` covers all four npm components, the GitHub Actions
> versions and two pip directories weekly, with `@aws-sdk/*` and `@smithy/*` grouped so
> they move together. A `dependency-audit` CI job gates the build on findings in the
> **production** dependency tree across all four components.
>
> Two choices worth not reversing: the gate uses `--omit=dev`, because the full tree
> carries ~95 unfixable `react-scripts` findings and a permanently red gate gets ignored;
> and it passes `--registry` explicitly, because against a registry without an advisories
> endpoint `npm audit` returns 404 and reports no findings rather than failing. Details in
> `security-findings.md`.
>
> Still outside automated coverage, by necessity: the PyUtils layer packages (pinned in
> an inline `pip install`, no manifest to parse), the ffmpeg binary, and the
> mediasearch submodule.

There is no `.github/dependabot.yml` and no scheduled dependency job, so
upgrades happen only when someone goes looking - which is how a 2022-era
`requests` pin and an end-of-support AWS SDK survived this long.

Note that any such automation must target the public npm advisory database
explicitly. Against an internal registry mirror that does not implement the
advisories endpoint, `npm audit` returns 404 and reports **no findings rather
than failing**, so a scanning job can appear green while checking nothing. See
`security-findings.md`.

---

## Suggested grouping for a follow-up release

1. **Make CI trustworthy first** - TD-3, TD-4, TD-5. Nothing else can be
   verified reliably until the build is green and believable.
2. **Make builds reproducible** - TD-7, TD-8, TD-6, TD-12.
3. **Deal with ffmpeg** - TD-2 spike first, then TD-1 with the answer in hand.
   Doing TD-1 before TD-2 risks carefully hardening a dependency that should
   have been removed.
4. **Tidy up** - TD-9, TD-10.
5. **Architecture** - TD-11, alongside any network isolation work.

---

## TD-13: `PUT /swap/{key+}` has no permission check (resolved)

**Theme:** authorization | **Effort:** done | **Priority:** n/a

> Resolved. `swap.js` is now wrapped in `withAuthorization`, `PUT /swap/{key+}` is
> mapped to `read_calls`, and - the structural part - `withAuthorization` now **denies
> by default** instead of passing unmapped routes straight through. The dead
> `GET /genaiquery` map entry has been removed, the UI button is gated, and the handler
> writes a `CALL_SPEAKERS_SWAPPED` audit entry. See `security-findings.md`.
>
> The permission chosen was **`read_calls`**, by decision, rather than `delete_calls`.
> That is a conscious exception - a read permission authorizing one specific write - and
> the rationale, residual risk, and the recommended `edit_calls` approach should finer
> granularity ever be wanted are recorded in `security-findings.md` under "Decision:
> `read_calls` governs speaker swap".
>
> The remaining GenAI authorization gap is **TD-16**, which this work surfaced but did
> not close.
>
> Retained below for the reasoning, which still explains why deny-by-default matters.

Found while repairing the unit test mocks in TD-3, not by reviewing the
authorization model - which has not been reviewed.

`pca-ui/src/lambda/swap.js` exports a bare handler:

```js
exports.handler = async function (event, context) {
```

Every other mutating API handler is wrapped - `delete.js`, `roles.js` and
`users.js` all use `withAuthorization(...)`. `swap.js` does not, and
`PUT /swap/{key+}` is absent from `PERMISSION_MAP` in `auth-middleware.js`. The
handler swaps caller and agent sentiment records in DynamoDB and the speaker
labels in the call's S3 JSON, keyed only on a path parameter.

**Severity is bounded by authentication.** `pca-ui/cfn/lib/api.template` sets
`DefaultAuthorizer: Cognito` with `AuthType: COGNITO_USER_POOLS`, so the route is
not reachable anonymously. The gap is authorization, not authentication: *any*
authenticated user can alter any call's attribution regardless of their role -
including the default `call-readwrite` role, and including a user whose role
grants no permissions at all. It also writes no audit entry, unlike the delete
path.

This is a data-integrity issue rather than disclosure. It mislabels who said what
in a call recording, which matters for a product whose output is used to assess
agent performance.

### The underlying design weakness

`withAuthorization` fails **open** for routes it does not recognise:

```js
const requiredPermission = PERMISSION_MAP[routeKey];

if (!requiredPermission) {
  return handler(event, context);
}
```

So wrapping `swap.js` alone will not fix it - the route must also be added to
`PERMISSION_MAP`, and nothing enforces that pairing. A deny-by-default would have
surfaced this route the moment RBAC was introduced, and would prevent the next
new route from repeating it. Fixing the default is the more valuable change.

Three routes are currently unmapped: `PUT /swap/{key+}`,
`GET /me/permissions` and `GET /genai/refreshsummary`. The latter two are
defensible - `/me/permissions` is self-service and returns only the caller's own
role, and `/genai/refreshsummary` is a Python handler outside this middleware -
but they are unmapped by accident rather than by decision, which is the point.

Deciding which permission `swap` should require is a product question. It is
plausibly `delete_calls`, since it mutates existing call data, but it may warrant
its own permission.

### Related latent bug in the same file

`auth-middleware.js` resolves permissions with:

```js
Array.from(result.Item.Permissions.values || result.Item.Permissions)
```

This relies on the AWS SDK v2 DocumentClient returning a String Set as
`{ values: [...] }`. If `Permissions` is ever a plain JavaScript array, `.values`
resolves to `Array.prototype.values` - a function, which is truthy - and
`Array.from` of a function yields `[]`. The user silently ends up with no
permissions.

**Resolved during the AWS SDK v3 migration**, where it stopped being latent: v3's
`lib-dynamodb` returns an SS attribute as a native `Set`, whose `.values` *is* a
function, so the expression would have resolved every user to zero permissions and
denied every gated route silently. Replaced by `toPermissionArray` in
`auth-middleware.js`, which handles the native `Set`, the v2 wrapper and a plain
array. See `security-findings.md`.

The authorization gap above - `swap.js` being unwrapped and absent from
`PERMISSION_MAP` - is **not** resolved and remains the substance of this item.

## TD-14: `pca-server/src/trigger/node_modules` was committed to git (resolved)

**Theme:** repository hygiene | **Effort:** done | **Priority:** n/a

Recorded because the cause is still present and will recur.

That directory held **1,214 tracked files**, 1,082 of them AWS SDK v2 source, even
though `.gitignore` has listed `node_modules` all along - `.gitignore` does not
untrack files already in the index. No other component did this: `pca-ui/src/witch`,
`pca-ui/src/lambda` and `pca-ui/src/www` all had zero tracked files there.

Untracked with `git rm -r --cached`, which only updates the index and leaves the
working tree alone. `publish.sh` runs `npm install` before packaging, so the
committed copy was never used by a build.

Two reasons this mattered beyond diff noise: dependency source carrying known CVEs
was committed into the repository, where no manifest-driven scanner would report
it; and the AWS SDK v3 migration would otherwise have required committing roughly
3,400 replacement files.

Worth a one-line check in review - `git ls-files | grep node_modules` - since
nothing prevents it happening again.

## TD-15: Call transcripts and PII are written to CloudWatch Logs (resolved)

**Theme:** data protection | **Effort:** done | **Priority:** n/a

> Resolved. All nine sites now log identifiers, counts and lengths instead of payloads -
> including `pca-aws-fetch-transcript.py`, the main-workflow step that logged the full
> transcript of every ingested call. `print(event)` calls became projections, since the
> raw events carry Cognito claims, a user's free-text query, or a CloudFormation
> pre-signed `ResponseURL`.
>
> **Two related items are deliberately NOT resolved** and remain worth doing:
>
> - **Log retention.** Lambda log groups created implicitly by the service never expire,
>   so anything already logged persists indefinitely. This change stops adding new
>   content; it does not remove what is already there, and existing log groups should be
>   reviewed and given an explicit retention period.
>   - **Observed, not just predicted.** On the live stack the implicitly created function
>     groups all report `retentionInDays: null`, and groups belonging to a *previous* UI
>     stack (`PCA-PCAUI-DDKU50P6PL8`) still sit alongside the current ones. A stack
>     replacement leaves its log groups behind, so transcripts logged before this fix
>     outlive the stack that produced them. Only `/pca/apigateway` (90), `/pca/audit`
>     (365) and the three Cognito helpers declare a retention.
> - **A CloudWatch Logs data protection policy** with managed PII identifiers, as
>   defence in depth against a future careless `print`. Not a substitute for the above,
>   since it masks known patterns rather than free-form conversation.
>
> Retained below for the site inventory.

Several handlers print whole call payloads to CloudWatch Logs. Call transcripts in this
product contain customer PII by nature, and the solution elsewhere offers Transcribe
content redaction and a redacted-audio playback option - so PII sensitivity is already
an acknowledged property of this data. Anyone with log read access on the account sees
it unredacted, outside whatever access control the API enforces.

Confirmed sites:

| File | Line | What is logged |
|---|---|---|
| `pca-server/src/pca/pca-aws-fetch-transcript.py` | 50 | `print(transcript_str)` - the full transcript |
| `pca-server/src/pca/pca-aws-sf-summarize.py` | 240 | `print(transcript_json)` - the full transcript |
| `pca-ui/src/genai/index.py` | 107 | `print("Prompt:", prompt)` - the transcript interpolated into the LLM prompt |
| `pca-ui/src/genai/index.py` | 153 | `print(transcript_json)` - the full transcript |
| `pca-ui/src/lambda/index.js` | 62 | `console.log("Parsed:", parsed)` - the entire parsed call JSON, including every speech segment |
| `pca-ui/src/lambda/index.js` | 118 | `console.log("Data:", data)` - call metadata including agent name and GUID |
| `pca-ui/src/lambda/input_bucket_trigger.js` | 45 | `console.log("Data:", data)` - as above |

Plus `print(event)` in both GenAI handlers and several server handlers, which captures
the raw API Gateway event including the caller's identity claims.

### Why conditioning the GenAI function did not fix this

Making `GenAIQueryFunction` conditional removes two of the seven sites above, and only
for deployments where `GenAIQueryType` is `DISABLED`. It changes nothing for the rest:

- **`pca-aws-fetch-transcript.py` is the significant one.** It is a step in the main
  processing workflow and runs for every call ingested, entirely independently of any
  GenAI setting. Its `print(transcript_str)` writes the full transcript of every
  processed call to logs. That is the largest-volume exposure here and the GenAI change
  does not touch it.
- `pca-ui/src/lambda/index.js` runs on every output-bucket object creation, also
  unconditionally.
- When GenAI **is** enabled - the configuration where the feature is actually used -
  `index.py` keeps logging transcripts and prompts as before.

So the GenAI work narrowed the surface slightly and resolved nothing structural.

### What addressing it involves

Not simply deleting the `print` calls - several are plainly debugging aids, but some
are load-bearing for support. Worth deciding deliberately:

- Remove or downgrade the full-payload logs, keeping identifiers (call key, job name,
  request id) and dropping content. Identifiers are what an operator actually needs to
  correlate a failure.
- Where payload logging is genuinely wanted for diagnosis, gate it behind an
  environment variable that defaults to off, so it is an opt-in action rather than the
  standing default.
- `print(event)` should become a projection of the event, not the whole object - the
  raw event carries identity claims.
- Consider a log-group retention and KMS review at the same time. The API access log
  group sets `RetentionInDays: 90`, but Lambda log groups created implicitly by the
  service default to never expire, so transcript content currently persists
  indefinitely.
- A CloudWatch Logs data protection policy with managed PII identifiers would mask
  common entities at write time. Useful as defence in depth, but it is not a substitute
  for not logging the content, since it masks known patterns rather than free-form
  conversation.

Worth pairing with the teardown documentation, since log groups outliving the stack is
exactly the kind of leftover that keeps holding data after `cdk destroy` or stack
deletion.

## TD-16: The GenAI endpoints perform no authorization (resolved)

**Theme:** authorization | **Effort:** done | **Priority:** n/a

> Resolved. Both handlers now authorize via `pca-ui/src/genai/pca_auth.py`, a port of
> `auth-middleware.js` that resolves the caller's `custom:pca_role` against the same
> roles table and requires `read_calls`. Denials are recorded in the audit log group,
> matching the Node handlers. IAM is scoped to `dynamodb:GetItem` on the roles table
> only, not a blanket read policy.
>
> The transcript-before-`QUERY_TYPE` ordering bug is fixed too: a disabled deployment no
> longer fetches the transcript at all.
>
> **One piece of debt was created rather than removed.** The permission model now exists
> in two languages with no shared layer, so a change has to be made twice and the two can
> drift. That is called out at the top of `pca_auth.py`. If a third runtime ever needs
> this, extract a service instead of porting a third time.
>
> Details in `security-findings.md`. Retained below for the reasoning.

`pca-ui/src/genai/index.py` and `refresh_summary.py` contain no claims inspection, no
role lookup and no permission check. The only access control on `GET /genaiquery` and
`GET /genai/refreshsummary` is the API's Cognito authorizer, so **any authenticated
user can use them regardless of role** - including one whose role grants no permissions
at all.

Both take a caller-supplied `filename` and act on it directly.

Consequences:

- `genaiquery` fetches the call transcript and sends it to an LLM with the caller's
  question. Since the model's answer is returned, a prompt such as "repeat the
  transcript verbatim" makes this a transcript-disclosure path, not just summarisation.
  It also spends model tokens per call, with no permission gate and no rate limit.
- `refresh_summary` **invokes the summarizer** on a caller-supplied filename,
  regenerating and overwriting the stored summary. That is an unauthorized write
  trigger with a cost attached.

### What has already been done

`GenAIQueryFunction` now carries `Condition: ShouldEnableGenAIQuery`, so the function
and its route are not created at all when `GenAIQueryType` is `DISABLED` - previously
both were created unconditionally and `GenAIQueryType` only drove a client-side flag
that hid the chat panel.

**That does not help a default deployment, and an earlier revision of this file claimed
it did.** `pca-ui.template` and `api.template` both default `GenAIQueryType` to
`DISABLED`, but neither default is ever used: the root templates always pass
`GenAIQueryType: !Ref GenAIQuery`, and `GenAIQuery` defaults to **`BEDROCK`** in both
`pca-main.template` and `pca-main-nokendra.template`. So a stock deployment has GenAI
query **enabled**, the function and route exist, and the condition changes nothing for
it. Confirmed against a live stack: `GenAIQueryFunction` is deployed with
`QUERY_TYPE: BEDROCK`.

This is the second finding in this release caused by reading an inner nested-template
default as if it were the effective value - `ffmpegDownloadUrl` was the first. TD-17
records the lesson; this entry is left as evidence that the warning was earned twice.

The condition is still worth keeping, because it makes `DISABLED` actually mean
disabled. But the control that matters for a default deployment is the `read_calls`
check now enforced in `pca_auth.py`, not the condition.

`GenAIRefreshSummaryFunction` is deliberately untouched: it belongs to the
call-summarization feature rather than GenAI query, so conditioning it on
`ShouldEnableGenAIQuery` would be wrong.

Also worth knowing: the handler fetches the transcript **before** it consults
`QUERY_TYPE`:

```python
transcript_str = get_transcript_str(filename)   # unconditional

if QUERY_TYPE == 'ANTHROPIC': ...
...
else:
    query_response = 'Query response disabled.'
```

So on a function that exists but is configured off, "disabled" suppressed the model
call but never the transcript retrieval. Reordering that check is a small, worthwhile
fix independent of the authorization work.

### What addressing it involves

There is no shared authorization layer across the two runtimes - `auth-middleware.js`
is Node and these handlers are Python - so this is not a line change. It needs a Python
equivalent that reads `event.requestContext.authorizer.claims`, resolves
`custom:pca_role` against the roles table, and checks a permission.

`read_calls` is the natural requirement for `genaiquery`, since it reads call content.
`refresh_summary` mutates stored data and is the better argument for an `edit_calls`
permission, which was considered and deferred when closing TD-13.

Two further notes: duplicating the middleware in a second language creates a drift risk
worth designing against, and whatever is built should **not** be registered in
`PERMISSION_MAP` unless the Python handlers genuinely consult it - a dead entry there is
what previously made `GET /genaiquery` read as protected when it was not.

## TD-17: Perform a full authorization model audit

**Theme:** authorization | **Effort:** days | **Priority:** high

> Security item, filed here for tracking. This is an **activity**, not a defect - but it
> is recommended rather than optional, for the reason below.

The authorization model has never been audited. Every authorization finding closed in
this release - the ungated `PUT /swap/{key+}`, the fail-open `withAuthorization` default,
the dead `GET /genaiquery` permission-map entry, the two unauthenticated GenAI endpoints,
the role-lookup bug that would have denied all users - was found **incidentally**, while
doing unrelated work: repairing unit test mocks, migrating an SDK, tracing a dependency.
None was found by looking.

That is the argument for the audit. A model that yields five distinct authorization
defects to people who were not searching for them should not be assumed sound in the
areas nobody has walked through. The deny-by-default change means a *new* unmapped route
now fails closed, which is real protection, but it says nothing about whether the
existing permission assignments are correct.

### Scope

Starting points, in rough priority order.

1. ~~**The user-writable role attribute.**~~ **Settled.** The self-escalation chain was
   confirmed against the deployed stack and then fixed in this release -
   `PCAUserPoolClient` now sets `WriteAttributes: [email]`, so `custom:pca_role` is no
   longer user-writable. See `security-findings.md`.

   One piece of it is still open and belongs to this audit: `pre-token-generation.js`
   injects the attribute into the access token **without validating it** against the
   roles table. That is now unreachable by a user, but it means the token claim is
   trusted because the attribute is, and the audit should decide whether to keep that
   property or validate at issuance.
2. **Route coverage, from the API outward rather than from the map.** Enumerate every
   route in `api.template` and establish, per route, which handler serves it, whether
   that handler enforces a permission, and in which runtime. Working from
   `PERMISSION_MAP` is how `GET /genaiquery` came to look protected while being served by
   a Python handler that never consulted it.
3. **Permission assignment correctness.** `read_calls` currently authorizes two
   mutations - `PUT /swap/{key+}` and the summary refresh - by deliberate decision
   (recorded in `security-findings.md`). Whether that is the right boundary for every
   route is a product question that has not been reviewed as a whole.
4. **Granularity.** Four permissions cover create, read and destroy but not modify;
   there is no `edit_calls`. See the decision record for the recommended shape if finer
   granularity is wanted.
5. **Privilege escalation and lockout paths within role management.** `roles.js` refuses
   to *delete* a role holding `manage_roles`, but `updateRole` has no equivalent guard -
   so the permission can apparently be removed from the admin role by editing it, which
   would be unrecoverable through the UI. Confirm and decide whether that matters.
6. **Object-level authorization.** `read_calls` is global: there is no per-call or
   per-tenant restriction anywhere, and every handler takes a caller-supplied key.
   Confirm that is the intended model rather than an omission.
7. **Cross-runtime drift.** The model now exists in `auth-middleware.js` and
   `pca_auth.py` with no shared layer (see TD-16). The audit should check they agree and
   recommend whether to extract a service.
8. **Identity plumbing.** The default-role trigger, the self-signup path, the optional
   email-domain restriction, and the `AdvancedSecurityMode: ENFORCED` setting - what each
   actually guarantees.
9. **IAM policy scoping.** Adjacent rather than part of the API authorization model, but
   unreviewed and known to be loose in places: `AmazonS3FullAccess` and
   `AmazonTranscribeFullAccess` on processing roles, and `s3:PutObject` on
   `arn:aws:s3:::${bucket}*` in the layer-builder roles, where the wildcard sits on the
   bucket *name* rather than the key.

### Note on method

Prefer reading the deployed configuration over reading the templates alone. Two of the
findings in this release existed only in the gap between them: the effective
`ffmpegDownloadUrl` came from the root template and silently overrode the inner default,
and `GenAIQueryType` drove a client-side display flag while the endpoint stayed live
regardless. A template-only review would have missed both.

**Read parameters root-to-leaf, never leaf-first.** Both of those templates declare a
nested-template default that is never used, because the root always passes a value down.
Twice in this release a nested default was mistaken for the effective value, and the
second time produced a wrong statement in `security-findings.md` that survived until the
solution was deployed and inspected. For every parameter that matters, establish the root
default first and treat the inner `Default:` as documentation of nothing.

## TD-18: Unit tests are packaged into the deployed Lambda artifacts

**Theme:** build hygiene | **Effort:** hours | **Priority:** low

The deployed `ListFunction` package contains 25 `*.test.js` files. They are the handlers'
own co-located tests in `pca-ui/src/lambda`, so `npm ci --omit=dev` cannot remove them -
that flag prunes dependencies, not first-party source.

Not exploitable: no test runner is present in the package, so nothing can execute them.
The cost is artifact size and a slightly larger surface for anyone who obtains the
package, since the tests document expected auth behaviour and include sample claim
payloads. Worth fixing because it is cheap.

The fix belongs in the packaging step rather than in the source layout - either a SAM
`Metadata`/`BuildProperties` exclusion, or moving the suites under `test/` to match the
project layout convention. Moving them is the better end state but touches 20-odd
`require` paths and the jest config, so it is the larger of the two changes.

Found while verifying that the `--omit=dev` packaging fix had taken effect on a live
deployment; recorded in `security-findings.md` under the live validation section.
