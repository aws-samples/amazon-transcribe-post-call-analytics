# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- Stack failure when 'loadSampleAudioFiles` set to `false` 

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

[Unreleased]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/compare/v0.3.4...develop
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
