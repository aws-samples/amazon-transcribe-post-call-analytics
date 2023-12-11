
#### Audio ingestion 

The Post-Call Analytics solution allows you to ingest files in more than one way, and this chapter will walk through the processes required in each one. It will talk through the flows at a high-level, leaving detailed discussion of the architectures and workflows for a later chapter. It will finish off by discussing some of the common error conditions that you may see, and how to re-submit an audio file for processing.

| Documentation Section | Description |
| --- | --- |
| [File drop](./file-drop.md) | How to ingest files via dropping an audio file into an S3 bucket |
| [Bulk files](./bulk-files.md) | How to bulk load a large number of files at once |
| [Error handling](./error-handling.md) | Typical error scenarios and how to to remedy them so that file ingestion can be re-tried |