# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **`docs/security-findings.md`** - dependency and authorization findings with the
  disposition of each, the procedure for reproducing the scan, and the decision records
  for choices that the code cannot explain on its own (why `read_calls` authorizes a
  write, why the `path-to-regexp` overrides are scoped, why the audit gate omits dev
  dependencies). Read this before changing anything security-relevant.
- **`docs/technical-debt.md`** - 17 tracked non-security items found during the same
  work, each with theme, rough effort and priority, plus a suggested grouping for a
  follow-up release. Several security items are filed here by decision to keep this
  release scoped; those carry a banner saying so.
- **One open high-priority finding is recorded but NOT fixed:** `custom:pca_role` is a
  user-writable Cognito attribute that the pre-token-generation trigger injects into the
  access token without validation, and the whole authorization model trusts that claim.
  Whether this is exploitable depends on which authentication flows the app client
  permits, which needs confirming against a deployed stack. See
  `docs/security-findings.md`.
- **A full authorization model audit is recommended** and tracked as TD-17. Every
  authorization defect fixed in this release was found incidentally while doing
  unrelated work, none by looking - which is the argument for auditing the areas nobody
  has walked through.

### Security

- **Closed a privilege-escalation path that let a signed-in user make themselves an
  administrator.** `PCAUserPoolClient` did not set `WriteAttributes`, and an app client
  that does not customise attribute permissions gets write access to *all* user pool
  attributes - including `custom:pca_role`, which is the entire authorization model: the
  Pre Token Generation trigger copies it into the access token, and both
  `auth-middleware.js` and `pca_auth.py` resolve it against the roles table. A user could
  write their own attribute, reauthenticate, and hold `admin` with `manage_roles` and
  `delete_calls`.
  - The client's OAuth scopes did not prevent this. Writing one's own attributes needs an
    access token carrying `aws.cognito.signin.user.admin`, which a hosted-UI code grant
    does not issue - but `ExplicitAuthFlows` is unspecified, so `ALLOW_USER_SRP_AUTH` is
    enabled by default and a token obtained directly from the user pools API carries that
    scope regardless of the client's configured scopes.
  - Now fixed with `WriteAttributes: [email]`, which removes the capability rather than
    relying on a scope being absent. `email` is required because the pool schema declares
    it `Required: true` and self-signup would otherwise fail. Role assignment is
    unaffected: the triggers, the role seeder and the `manage_roles` API all use
    `AdminUpdateUserAttributes` under IAM credentials, which a client's `WriteAttributes`
    does not constrain.
  - **Severity depends on one deployment parameter.** With the default
    `AllowAdminCreateUserOnly: true` an attacker needs an existing account. Any deployment
    that sets `AllowedSignUpEmailDomain` turns self-signup on, at which point anyone with
    an address at the permitted domain could register and escalate.
  - Confirmed against a live deployment before being fixed, including the
    `ExplicitAuthFlows` default behaviour. The exploit itself was not run. See
    `docs/security-findings.md` for the evidence and for why the `WriteAttributes`
    reference documentation reads as though this were not exploitable.

- **`ffmpeg` is no longer downloaded from the internet during stack creation.** A
  CloudFormation custom resource previously fetched a static `ffmpeg` tarball from a
  third-party website while the stack was being created, with no checksum or signature
  verification of any kind, and then ran the resulting binaries against user-uploaded media.
  The effective URL also used plain `http`, relying on an upstream redirect for transport
  security.
  - The binaries are now built into the Lambda layer at publish time by
    `pca-server/src/ffmpeg/build-ffmpeg-layer.sh`, which pins the version and verifies the
    download against a pinned SHA256 over HTTPS before packaging. A bad, unexpected or
    substituted download now fails the release build instead of a customer's deployment.
  - The layer ships as an ordinary published asset via `aws cloudformation package`, so the
    processing Lambdas no longer need a route to the internet in order to deploy.
  - The bundled `ffmpeg` moves from 4.4 (April 2021) to 7.0.2, picking up several years of
    upstream fixes.
  - Because `cloudformation package` generates a content-addressed S3 key, changing the
    binary now publishes a new layer version. The previous fixed `ffmpeg.zip` key meant an
    updated binary produced no CloudFormation property change and therefore no new layer.

- **Migrated from AWS SDK for JavaScript v2 to v3.** v2 reached end-of-support on
  2025-09-08 and receives no further security fixes, so no version bump could address
  it. Done in three increments: `pca-server/src/trigger`, `pca-ui/src/witch`, then
  `pca-ui/src/lambda` (22 source files). Every deployed Node component now reports zero
  dependency vulnerabilities.
  - `pca-ui/src/witch`'s Lambda layer drops from roughly 60 MB to 3.6 MB, since only
    the S3 client is bundled rather than the whole monolithic v2 SDK.
  - Several v2-only behaviours were corrected rather than carried over as silent bugs.
    v2 normalised empty result sets into empty arrays while v3 omits them, affecting
    nine code paths including two CloudFormation custom resources. `err.code` is not
    populated in v3 and three sites used it for control flow, one of which gated the
    schema-propagation retry in the role seeder and would have failed stack deployment.
    `getObject` bodies are streams rather than Buffers, and `.toString()` on a v3 body
    returns `"[object Object]"` instead of throwing. `getSignedUrl` became asynchronous
    and renamed `Expires` to `expiresIn`. DynamoDB `Limit` is no longer coerced from a
    string. `ddb.createSet()` and `s3.upload()` no longer exist.
- **Fixed a role lookup that would have denied all users after the SDK migration.**
  `auth-middleware.js` read permissions as `Permissions.values || Permissions`, matching
  the v2 DocumentClient's `{ values: [...] }` wrapper. `@aws-sdk/lib-dynamodb` returns a
  DynamoDB String Set as a native `Set`, whose `.values` is a function - truthy - so
  `Array.from` would have yielded an empty array and every user would have resolved to
  zero permissions and been refused every gated route, with nothing logged or thrown.
  Permissions are now normalised through a helper that accepts the native `Set`, the v2
  wrapper and a plain array, so roles written by earlier versions keep working.
- **Dependency bumps for known CVEs.** `axios` to ^1.20.0 and `ajv` to ^8.20.0, plus
  in-place updates to `browserslist` and `@babel/*`. The unused `aws-sdk` dependency
  was removed from the web UI entirely - it was declared but imported nowhere. The
  web UI's production dependency tree now reports zero vulnerabilities, down from
  nine.
  - Two **scoped** `path-to-regexp` overrides were added to
    `pca-ui/src/www/package.json`: `^1.9.0` under `react-router` and `0.1.13` under
    `express`. The scoping is load-bearing and must not be collapsed into a single
    global override - two different major lines of that package are in the tree and each
    consumer needs its own. A global override removes the nested copy `express`
    resolves and breaks the dev server at runtime. This clears both advisories without
    the breaking `react-router-dom` v6 migration.
- **Python Lambda layer packages updated.** `requests` 2.28.1 to 2.34.2 and `filetype`
  1.0.13 to 1.2.0, and the `urllib3<2.0` cap was removed in favour of a pin to 2.8.0.
  That cap had held the layer on the final 1.x release, where seven CVEs are
  unfixable because every fix landed in 2.x only. Eleven CVEs in total.
  - **If you change these pins again, two further bumps are mandatory.** The layer's
    content is addressed by its S3 key, so editing the versions changes the zip's
    contents but not its key - CloudFormation sees no property change, publishes no new
    layer version, and the functions keep running the old packages while the stack still
    reports `UPDATE_COMPLETE`. Bump the `PyZipName` default (now
    `python-utils-layer-v3.zip`) and the `Version` property on the `PyUtilsZip` custom
    resource (now `3`), then confirm after deploying that the published `LayerVersion`
    number actually incremented. Stack status alone will not tell you.
  - The three packages are also now installed in a single `pip` call so they resolve
    together, rather than three sequential installs where a later one could overwrite an
    earlier one's dependencies.

- **Release builds are now reproducible.** `publish.sh` and `publish-nokendra.sh` used
  `npm install` at eight call sites, which treats the lockfile as advisory and may
  resolve and write newer versions - so a release did not necessarily ship the
  dependency tree that had been reviewed. All eight are now `npm ci`, and each has
  `|| exit 1`; the previous calls had no failure check, so a failed install did not stop
  the build.
  - The required Node version is raised from 18 to 20. The AWS SDK v3 packages declare
    `engines.node ">=20.0.0"` and npm only warns on a mismatch rather than failing.
  - `publish-nokendra.sh` now performs the npm and Node version checks at all. It
    previously had none, so the no-Kendra path could be built on an unsupported
    toolchain silently.
  - A committed `.npmrc` in each Node component pins `lockfile-version=2`, so the
    lockfile format no longer changes depending on which npm version a contributor has.
- **Development dependencies are no longer packaged into the deployed Lambda functions.**
  `aws cloudformation package` zips the whole `CodeUri` directory, `node_modules`
  included, so whatever the publish script installed was shipped. A plain install put the
  entire jest tree - 344 packages, 46 MB, carrying every dev-only CVE finding reported
  during the install - inside the deployed `pca-ui/src/lambda` package.
  - The publish scripts now use `npm ci --omit=dev` for the three components whose
    directories become deployed artifacts: `pca-server/src/trigger`,
    `pca-ui/src/lambda`, and `pca-ui/src/witch` (whose build copies `node_modules` into
    a layer zip). `pca-ui/src/lambda` drops to 46 packages and 17.8 MB.
  - `pca-ui/src/www` deliberately keeps the full install: `react-scripts` is a
    devDependency needed to produce the build, and only the resulting `build/` directory
    is packaged.
  - Consequence worth knowing: a package a handler needs at runtime must now be a
    `dependency`, not a `devDependency`. A misplaced entry will work locally and in CI
    and fail in Lambda.
- **Added automated dependency scanning.** `.github/dependabot.yml` covers all four npm
  components, the workflow's own action versions, and two pip directories weekly, with
  the `@aws-sdk/*` and `@smithy/*` packages grouped so they move in lockstep. A new
  `dependency-audit` CI job fails the build on any known vulnerability in the production
  dependency tree. The audit is scoped with `--omit=dev` because the build-time tree
  carries findings that cannot be resolved while Create React App remains, and it pins
  the registry explicitly because `npm audit` against a registry without an advisories
  endpoint reports no findings rather than failing.
- **CI moved from Node 14 to Node 20 and from `npm i` to `npm ci`.** Node 14 reached end
  of life in April 2023; after the AWS SDK v3 migration that job could no longer install
  at all. `actions/checkout@v2` and `actions/setup-node@v1` are replaced with `@v4`.

### Fixed

- **Two of three `pca-ui/src/lambda` unit test suites could not run.** Their
  `jest.mock("aws-sdk")` factories omitted `CloudWatchLogs` and
  `DynamoDB.DocumentClient`, both of which are constructed at module load once a
  handler is wrapped in `withAuthorization`, so the suites failed during import
  before any test body ran. The suites were also semantically stale: their events
  predate role-based access control and returned 403 once the mocks were repaired.
  They now supply the access token claims that the Cognito Pre Token Generation
  trigger injects in production.
  - The mocks were subsequently rewritten for AWS SDK v3 using `aws-sdk-client-mock`,
    added as a development dependency. v3 has no single module to intercept, so mocks
    are declared per client rather than per SDK.
  - A new `auth-middleware.test.js` suite covers the deny-by-default behaviour, the
    distinct audit reason recorded for an unmapped route, and the `authContext` contract
    that audit attribution depends on. Now 4 suites and 17 tests, up from 1 suite and 1
    test.

- **The GenAI API endpoints now enforce authorization.** `GET /genaiquery` and
  `GET /genai/refreshsummary` previously performed no permission check of any kind - the
  API's Cognito authorizer was the only control, so any authenticated user could read any
  call's transcript through the model, spend model tokens, and overwrite stored summaries,
  whatever their assigned role. Both now require `read_calls`, resolved against the same
  roles table the rest of the API uses, and record denials in the audit log group.
  - Fixed alongside it: the query handler fetched the call transcript *before* checking
    whether queries were enabled, so a disabled deployment still read and logged the
    transcript on every request and only suppressed the model call.
  - Note this duplicates the permission model into a second language. There is no shared
    layer between the Node and Python handlers, so changes must be made in both.
- **Call transcripts are no longer written to CloudWatch Logs.** Nine sites logged whole
  call payloads, including a step in the main processing workflow that printed the full
  transcript of every ingested call regardless of configuration - unredacted customer PII,
  visible to anyone with log read access and outside whatever access control the API
  enforces. All now log identifiers, counts and lengths. `print(event)` calls became
  projections, since the raw events carry Cognito claims, a user's free-text query, or a
  CloudFormation pre-signed `ResponseURL`.
  - This stops new content being written. It does not remove what was logged previously;
    Lambda log groups created implicitly by the service never expire, so existing groups
    should be reviewed and given a retention period.
- **Fixed duplicate CloudFormation parameters.** `QueryCapacityUnits` and
  `StorageCapacityUnits` were each declared twice in `pca-main.template`. The definitions
  were identical so there was no behavioural change, but duplicate YAML keys were raising
  `E0000` errors that failed the lint job and masked two further warnings in that file -
  cfn-lint stops analysing a template once it hits a parse-level error.
- **Minor template cleanups**, both revealed once the duplicate-key errors above stopped
  aborting cfn-lint's analysis of `pca-main.template`.
  - Removed an unnecessary `Fn::Sub` on the inline code of `TestBedrockModelFunction`.
    It had no substitution variables, so it was a no-op - and a small hazard, since any
    `${...}` later added to that Python would have been interpreted by CloudFormation
    rather than left alone.
  - Removed the unused `HasAnthropicQuery` condition from `pca-ui.template`. It was
    declared but never referenced; the condition actually in use is
    `HasAnthropicSummary` in `lib/api.template`.
- **The ffmpeg Lambda layer now declares `CompatibleRuntimes` and
  `CompatibleArchitectures`.** It previously declared neither, so nothing recorded that
  the bundled binaries are x86_64 Linux builds.
- **`docs/deployment/configuration.md`** no longer documents the removed
  `ffmpegDownloadUrl` parameter, and explains what replaced it.
- **The CI lint job can now pass.** It gates on cfn-lint *errors* via
  `--non-zero-exit-code error` while still printing warnings. Previously any non-zero
  exit failed the step and cfn-lint exits non-zero on warnings, so that job had been red
  since the first warning appeared. cfn-lint is also now pinned to 1.46.0 and installed
  via pip, rather than being pulled at "Latest Version" by a third-party action where a
  new release could change the gate with no commit to this repository.
- **`PUT /swap/{key+}` now requires a permission.** The handler was not wrapped in the
  authorization middleware and the route was absent from the permission map, so any
  authenticated user could re-attribute the caller and agent on any call regardless of
  their role - including a role granting no permissions at all. It now requires
  `read_calls` and writes a `CALL_SPEAKERS_SWAPPED` audit entry, and the UI button is
  gated to match.
  - `read_calls` was chosen deliberately over `delete_calls`: swapping speaker labels
    corrects a call you can already view, and the alternative would have forced anyone
    needing to fix a mislabelled speaker to also hold deletion rights. The effect is
    that any user who can open a call can re-attribute its speakers, which is intended.
    If "may correct call data" later needs separating from "may view call data", the
    recommended route is a new `edit_calls` permission rather than reusing
    `delete_calls` - see `docs/security-findings.md`.
- **The authorization middleware now denies unmapped routes instead of allowing them.**
  `withAuthorization` previously invoked the handler with no check at all when a route
  was absent from `PERMISSION_MAP`, treating "not listed" as "public". That is how the
  swap route stayed open, and wrapping a handler alone would not have fixed it. A route
  that is not mapped is now unreachable, which turns a silent hole into an obvious
  error. Verified that every route served by a wrapped handler is mapped, so no
  existing route changes behaviour.
- **Removed a misleading permission-map entry for `GET /genaiquery`.** The route is
  served by a Python handler that never passes through the Node middleware, so the
  entry had no effect while reading as coverage to anyone auditing the map.
- **The GenAI query function and its `/genaiquery` route are no longer created when
  `GenAIQueryType` is `DISABLED`.** Both were previously created unconditionally;
  `GenAIQueryType` only drove a client-side flag that hid the chat panel, so the
  endpoint stayed live and reachable on a disabled deployment. The function performs no
  authorization of its own, and it fetches the call transcript *before* checking
  whether queries are enabled, so "disabled" suppressed only the model call.
  - This affects only deployments that explicitly select `DISABLED`. The root templates
    default `GenAIQuery` to `BEDROCK` and always pass it down, so a stock deployment has
    the feature **enabled** and the condition changes nothing for it - the control that
    matters there is the `read_calls` check above.

### Removed

- **`pca-server/src/trigger/node_modules` is no longer tracked in git.** 1,214 files,
  1,082 of them AWS SDK v2 source, had been committed despite `.gitignore` listing
  `node_modules` - adding a path to `.gitignore` does not untrack files already in the
  index. No other component tracked its dependencies, and `publish.sh` installs them
  before packaging, so the committed copy was never used by a build.
- **`pca-server/cfn/lib/ffmpeg.template`.** The entire nested stack is deleted. Its only
  purpose was the deploy-time download custom resource, which the publish-time build
  replaces. On a stack update CloudFormation removes the nested stack; the `ffmpeg.zip`
  object it previously wrote into the support files bucket is left behind and can be
  deleted by hand.
- **Breaking: the `ffmpegDownloadUrl` CloudFormation parameter.** There is no longer a
  download to configure. Remove it from any scripted deployment - CloudFormation rejects
  parameters that a template does not declare, so leaving it in place will fail the
  deployment. On update, the nested `FFMPEG` stack and its custom resource are deleted; the
  `ffmpeg.zip` object previously written into the support files bucket is left behind and can
  be deleted by hand.

## [0.8.0] - 2026-10-13

### Added

- **Role-based access control (RBAC) for the PCA web UI.** Access is now governed by four
  permissions - `read_calls`, `upload_recordings`, `delete_calls` and `manage_roles` - which are
  grouped into named roles stored in a new DynamoDB roles table. A user's role is held in the
  Cognito `custom:pca_role` attribute and injected into the access token by a Pre Token Generation
  V2 trigger, and every API endpoint is authorized against it.
  - Two roles are seeded on stack creation: `admin` (all four permissions) and `call-readwrite`
    (`read_calls` + `upload_recordings`). The `AdminUsername` user is assigned `admin`.
  - New users, whether self signed-up or created in Cognito by an administrator, default to
    `call-readwrite`, which preserves the read and upload behaviour users have always had with PCA.
- **Role Management screen** at `/admin/roles` for creating, editing and deleting roles and for
  assigning roles to users. The Admin navigation item is only shown to users holding
  `manage_roles`.
- **Call deletion from the web UI**, gated by the `delete_calls` permission.
  - Single call deletion from the call detail page, with a confirmation prompt.
  - Multi-select batch deletion from the call list and search results (maximum 25 calls per batch).
  - Deletion removes the original audio, the playback audio, the parsed results JSON and the
    Amazon Transcribe result files for both standard and Call Analytics jobs. The DynamoDB record
    is removed by the existing output bucket S3 event trigger, so a deleted call can take a minute
    or two to disappear from the list.
- **New API endpoints:** `DELETE /delete/{key+}`, `POST /delete/batch`, `GET|POST /roles`,
  `PUT|DELETE /roles/{roleName}`, `GET /users`, `PUT /users/{username}/role` and
  `GET /me/permissions`.
- **Audit logging** to a new `/pca/audit` CloudWatch log group (365 day retention) covering
  `AUTH_DENIED`, `ROLE_CREATED`, `ROLE_UPDATED`, `ROLE_DELETED`, `USER_ROLE_CHANGED` and
  `CALL_DELETED` events.
- **API Gateway access logging** to a new `/pca/apigateway` CloudWatch log group (90 day
  retention), including request ID, caller, resource path, status, latency and response size.
- **Optional observability stack** (`pca-observability/pca-observability.template`). Deploys
  CloudWatch dashboards for the PCA and bulk Step Functions workflows, Lambda, DynamoDB and
  Amazon Bedrock, plus optional CloudFront, API Gateway and WAF dashboards, along with CloudWatch
  alarms and an encrypted SNS topic for email notifications. This stack is deployed separately
  from the main PCA stack.
- Support for the Anthropic Claude 4.5 models `us.anthropic.claude-haiku-4-5-20251001-v1:0` and
  `us.anthropic.claude-sonnet-4-5-20250929-v1:0` for summarization and GenAI queries.
- New `Version` CloudFormation parameter (default `0.8.0`) on the main templates. The web UI
  deployment is now keyed off this value rather than a hardcoded version, so changing it forces
  the UI to be redeployed when a stack is updated.
- New `TranscribeResultsPrefix` parameter (default `transcribeResults`) on the UI stack, used to
  locate Transcribe result files during call deletion.

### Changed

- The Cognito user pool now has `AdvancedSecurityMode` set to `ENFORCED`, which is required for the
  Pre Token Generation V2 trigger, and requests the additional `profile` OAuth scope.
- The home page now adapts to the signed-in user's permissions: the call list is only fetched with
  `read_calls`, the upload panel is only shown with `upload_recordings`, and a user holding neither
  permission is shown an explanatory message instead.

### Fixed

- File name metadata parsing (date/time, call GUID, agent and customer) is now case insensitive, so
  recordings whose names differ only in case from the configured regular expressions are matched
  correctly.

## [0.7.17] - 2025-09-18

### Fixed
- Store JSON output produced by GenAI as sub-node below the Summary node #326
- misc dependabot PRs


## [0.7.16] - 2025-07-07

### Fixed
- Added STACK_NAME environment variable to bulk workflow Lambda functions #322
- misc dependabot PRs


## [0.7.15] - 2025-07-03

### Added
- Contributed feature for synthesizing test calls - PR #278
- Additional contributed solution documentation intended to facilitate developer onboarding #282

### Fixed
- #300 - glue table definitions broken
- Update Lambda Runtime to NodeJS 22.x
- #299 - handle comprehend detect_sentiment api has limits of input size of 5kb
- #310 - Change Default Model from Nova-Lite to Nova-Pro for GenAI Queries and Summarization in PCA CFN Templates
- Added missing STACK_NAME environment variable to BulkFilesCount Lambda function to fix ParameterNotFound error
- #305 - Extend query window to 5 years and modify sample file timestamps
- misc dependabot PRs


## [0.7.14] - 2025-02-27

### Fixed
- Stack rollback when deploying with dashboard option enabled, due to lambda timeout - PR #298

## [0.7.13] - 2025-02-21

### Fixed
- Remove Boto3 layer from all Lambda functions as Bedrock features are available in the base Boto package deployed in Lambda
- Updated all Lambda functions to Python 3.13 runtime

## [0.7.12] - 2025-02-21

### Added
- Added support for Amazon Nova models (amazon.nova-micro-v1:0, amazon.nova-lite-v1:0, amazon.nova-pro-v1:0) - PR #295
- Updated Anthropic Claude models to the latest 3.5 versions (anthropic.claude-3-5-haiku-20241022-v1:0, anthropic.claude-3-5-sonnet-20241022-v2:0) - PR #295
- Removed older versions of Amazon Titan and Anthropic Claude models (amazon.titan-text-express-v1, anthropic.claude-v1, anthropic.claude-instant-v1, anthropic.claude-v2) - PR #295
- Refactored Bedrock calls to use the Converse API eliminating the need for custom model specific payloads - PR #295
- Refactored all model invocation to use Inference Profiles. This is required for Nova models. It is also applied to Anthropic models for consistency and improved scalability. - PR #295
- Added adaptive retry configuration to Bedrock api calls to add some tolerance for quota throttling exceptions (at the expense of latency) - PR #295

### Fixed
- Fixed: Only one PCA stack may be sucessfully deployed in a given account/region due to fixed SSM parameter names - PR #291, #293
- Fixed: Current publish.sh does not work with ARM chipsets such as the Apple M series. Set x86_64 arch for local build - PR #288


## [0.7.11] - 2024-10-09

### Added
- Disable checking if Bedrock models are enabled (default is set to true i.e check it which is the right setting for most cases).
- Allow users to sign-up for access to Web UI when AllowedSignUpEmailDomain is populated (disable if left blank. enabled for all domains if * is entered).

## [0.7.10] - 2024-08-12

### Added

- Allow Kendra Capacity to be specified (Enterprise Edition only) PR #250
- Make deployment of the PCA UI stack conditional (i.e. deploy server only) #264

### Fixed

- Fix: When choosing Kendra option, PCA fails to deploy in new AWS accounts due to CodeCommit deprecation for new accounts. #265
  - _NOTE you will be asked to create a new password for the MediaSearch Finder app when you update an existing PCA stack with Kendra Transcript search enabled._
- Modified the LLM prompt for Titan Express - remove the Human and Assistant strings when Titan Express is selected. PR #244

## [0.7.9] - 2024-05-24

### Added

- Support for Anthropic Claude Haiku and Sonnet models to perform call summarization and queries.
- Upgraded Python runtime to 3.11 and NodeJS to version 18.x

## [0.7.8] - 2024-03-29

### Fixed

- Fix an issue with job status indicator (step function workflow) inserting duplicate entries into DynamoDB.
- Fix regression in the mediasearch finder to re-enable hyperlink to PCA call detail page

## [0.7.7] - 2024-03-06

### Added

- Fix #245 TranscriptKendraSearch page fails to build / load after deployment

## [0.7.6] - 2024-02-16

### Added

- PCA UI now shows the status of the step function workflow for each call.
- Added support for the new Transcribe Call Analytics generative call summarization option.

### Fixed

- Dependabot updates for PCA
- #234 Fix exception for files that contain no speech segments.
- Fix input bucket trigger to not create a DynamoDB record for metadata files.
- Updated NodeJS to v16.
- Fix bug when deploying with Amazon Titan Text Express.

## [0.7.5] - 2024-01-17

### Added

- Support for larger prompts by storing LLMPromptSummaryTemplate in S3 rather than SSM. By default, the CF template will migrate existing SSM prompts to DynamoDB.

### Fixed

- #125 Updated the pca-aws-sf-bulk-queue-space.py function to correctly count jobs based on IN_PROGRESS as well as QUEUED
- #224 Updated the pca-aws-sf-bulk-queue-space.py function to correctly count both Transcribe and Transcribe Call Analytics (vs just Transcribe).

## [0.7.4] - 2023-12-15

### Added

- Drag/drop upload from call list page.
- Refresh call summary from call details page.

### Fixed

- Accessibility improvements

## [0.7.3] - 2023-10-11

### Fixed

- #187 - Got error message in PostCallAnalyticsWorkflow step function
- #189 - Uploading some MP3 files fails to trigger workflow - files remain unprocessed
- #190 - Transcription search web UI opens with an error page after deployment
- #199 - BedrockBoto3 stack update failure when lambda function is replaced during update

## [0.7.2] - 2023-10-03

### Fixed

- Enable Bedrock GA by default for call summarization and chat/generative query
- Prompt updates for Bedrock GA release (formatting, multiple prompts per call)
- Updated GenerativeAI README and main README with model access details
- Links to the LLM Parameter Store Prompts from the CloudFormation Output
- Adaptive retries for SSM GetParameter and InvokeModel to prevent throttling errors

## [0.7.1] - 2023-09-05

### Fixed

- Stack deploy failure (unable to create secret in SecretsManager) when SummarizationLLMThirdPartyApiKey is left empty. Changed default value to 'undefined'.

## [0.7.0] - 2023-09-01

### Added

- Bedrock summarization support
- Support for multiple summarization prompts
- Bedrock and Anthropic chat/generative query support
- Additional configurable columns in call list
- Migrate 3P LLM API Key to Secrets Manager

## [0.6.0] - 2023-06-12

### Added

- Experimental generative transcript summarization provides a short paragraph with a synopsis of each completed call; use the built-in summarization model which runs on Amazon Sagemaker, or use Anthropic's Claude API with 100K token limit (eliminating transcript length limitations), or experiment with custom language models or APIs of your choice. See [Transcript Summarization](./README.md#optional-generative-ai-call-summarization)
- User Interface updated to use the [Cloudscape](https://cloudscape.design/) framework with improved functionality and appearance.

## [0.5.2] - 2023-05-25

### Fixed

- Update Lambdas from Node.js 12x to 14x (12.x is deprecated)

## [0.5.1] - 2023-05-15

### Fixed

- Cloudformation stack failing due to recent S3 bucket changes on ACLs #163 #165

## [0.5.0] - 2023-03-23

### Added

- Option to deploy Advanced reporting and analytics for the Post Call Analytics (PCA) solution with Amazon QuickSight
- Supports Transcribe Custom Language Models (CLM)

## [0.4.0] - 2022-11-27

### Added

- Supports ingestion of post-call output transcripts from Transcribe Real-time Call Analytics.
- Supports integration with Live Call Analytics and Agent Assist (LCA) v0.6.0 or later. See [LCA Integration](./README.md#live-call-analytics-and-agent-assist-companion-solution)

## [0.3.4] - 2022-11-9

### Added

- Additional processing for Genesys CTR telephony files. See [Integration with Telephony CTR Files](./README.md#integration-with-telephony-ctr-files)
  - Handling the same agent being on the call multiple times
  - Removing entities from lines tagged as being from the IVR
  - Extraction of header-level metadata from Genesys in a new Telephony results header block

### Fixed

- lag on Call Detail UI page reload for long calls
- refactored code to incorporate witch lambda layer source in the repo instead of downloading prebuild zip file

## [0.3.3] - 2022-09-14

### Fixed

- SFProcessTurn causing CREATE_FAILURE and stack rollback. This was caused by the Sept 10 release of the FFMPEG v5.1.1 distribution which had a larger size than the earlier version, resulting in the FFMPEG Lamba Layer exceeding the max size allowed by the Lambda service. To avoid this issue, the main stack CloudFormation parameter `ffmpegDownloadUrl` now defaults to the v4.4 distribution instead of 'latest'.
- Reduce Lambda function failure rate when processing very large audio files:
  - Increase multiple PCA server lambda function memory allocation to make functions run faster, and increase timeouts to reduce liklihood of timeouts when processing large audio files.
  - Increase empheral storage for 'StartTranscribeJob' lambda to accomodate S3 download and temp storage of large audio files.

## [0.3.2] - 2022-08-24

### Fixed

- PCA Workflow failure with KMS encrypted recordings caused by the new `SFPostCTRProcessing` Lambda function role not included in KMS Key policy. Function role now included in the `RolesForKMSKey` output.
- CopyObject AccessDenied issue when using BulkMove with recording files that have S3 tags.

## [0.3.1] - 2022-08-23

### Fixed

- Support nested folders in bulk workflow

## [0.3.0] - 2022-08-12

### Added

- Initial processing for Genesys CTR telephony files. See [Integration with Telephony CTR Files](./README.md#integration-with-telephony-ctr-files)

### Fixed

- Stack outputs `RolesForKMSKey` - Replace incorrect function ARN with Role Arn for BulkMoveFiles, and added BulkFilesCount

## [0.2.5] - 2022-07-05

### Fixed

- Stack failure when 'loadSampleAudioFiles`set to`false`

## [0.2.4] - 2022-06-10

### Fixed

- Use sigv4 for S3 presignedURLS
- New stack output with list of role ARNS thta need access KMS key (if any) used to encrypt S3 InputBucket, OutputBucket, or BulkUploadBucket

## [0.2.3] - 2022-06-09

### Fixed

- Simplifies workflow by using new Transcribe API to specify Custom Vocabulary and Vocabulary Filter at the same time as using Language ID.

## [0.2.2] - 2022-06-01

### Fixed

- Replaces ':' with '-' when constructing Transcribe job name. Note, use '-' instead of ':' in any custom regex patterns specified in CF parameter, as regex is applied to the generated job name after replacement.

## [0.2.1] - 2022-04-20

### Fixed

- supports audio files placed in subfolders under IngestBucket path. Replaces '/' with '-' when constructing job name.

## [0.2.0] - 2022-03-22

### Added

- add support for Transcribe Call Analytics call summarization (ActionItems, Outcomes)

### Fixed

- fix "Load more" button on PCA Home page

## [0.1.4] - 2022-03-06

### Fixed

- fix content security policy for S3 bucket url used to access recordings in the UI for non us-east-1 regions
- add new Filename Regex to keep track of calls from a particular Customer, or a caller's name or ID. Similar to AGENT and GUID. This also adds the additional structure to the pca glue catalog, so that a query can be used to group calls by CUST.
- add CloudFormation parameter pattern rules to defend against reported instances of browser autofill populating BulkUploadStepFunctionName and ConversationLocation parameters with user's first & last name, causing subsequent stack failure.
- merge dependabot PRs

## [0.1.3] - 2022-02-19

### Fixed

- Fix deployment failure for regions other than us-east-1
- Fix template validation failures when publishing in regions where Amazon Kendra is not supported

## [0.1.2] - 2022-01-14

### Fixed

- Specify a manifest-src in the content security policy.
- Fix broken image link in call detail page for recordings processed by Transcribe standard (not Call Analytics)

## [0.1.1] - 2022-01-07

### Fixed

- Athena queries broken due to image storage path
- Recordings processed by Transcribe standard (not Call Analytics) fail to show up in the UI

## [0.1.0] - 2021-12-17

### Added

- Initial release

[Unreleased]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/compare/main...develop
[0.8.0]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.8.0
[0.7.17]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.7.17
[0.7.16]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.7.16
[0.7.15]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.7.15
[0.7.14]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.7.14
[0.7.13]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.7.13
[0.7.12]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.7.12
[0.7.11]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.7.11
[0.7.10]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.7.10
[0.7.9]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.7.9
[0.7.8]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.7.8
[0.7.7]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.7.7
[0.7.6]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.7.6
[0.7.5]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.7.5
[0.7.4]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.7.4
[0.7.3]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.7.3
[0.7.2]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.7.2
[0.7.1]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.7.1
[0.7.0]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.7.0
[0.6.0]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.6.0
[0.5.2]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.5.2
[0.5.1]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.5.1
[0.5.0]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.5.0
[0.4.0]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.4.0
[0.3.4]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.3.4
[0.3.3]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.3.3
[0.3.2]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.3.2
[0.3.1]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.3.1
[0.3.0]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.3.0
[0.2.5]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.2.5
[0.2.4]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.2.4
[0.2.3]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.2.3
[0.2.2]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.2.2
[0.2.1]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.2.1
[0.2.0]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.2.0
[0.1.4]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.1.4
[0.1.3]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.1.3
[0.1.2]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.1.2
[0.1.1]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.1.1
[0.1.0]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/0.1.0
