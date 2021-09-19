import Kendra from "aws-sdk/clients/kendra";
import { CREDENTIALS_FILE_NAME, CREDENTIALS_FILE_PATH } from "./constants";
import S3 from "aws-sdk/clients/s3";

const _loadingErrors = [];

// If you get an error here, please revisit the Getting Started section of the README
let config = null;
try {
  config = require(`./${CREDENTIALS_FILE_NAME}`);
} catch {
  _loadingErrors.push(
    `${CREDENTIALS_FILE_PATH}/${CREDENTIALS_FILE_NAME} could not be loaded. See Getting Started in the README.`
  );
}

if (config) {
  if (!config.accessKeyId) {
    _loadingErrors.push(
      `There is no accessKeyId provided in${CREDENTIALS_FILE_PATH}/${CREDENTIALS_FILE_NAME}`
    );
  }
  if (!config.secretAccessKey) {
    _loadingErrors.push(
      `There is no secretAccessKey provided in ${CREDENTIALS_FILE_PATH}/${CREDENTIALS_FILE_NAME}`
    );
  }
  if (!config.region) {
    _loadingErrors.push(
      `There is no region provided in ${CREDENTIALS_FILE_PATH}/${CREDENTIALS_FILE_NAME}`
    );
  }
  if (!config.indexId || config.indexId.length === 0) {
    _loadingErrors.push(
      `There is no indexId provided in ${CREDENTIALS_FILE_PATH}/${CREDENTIALS_FILE_NAME}`
    );
  }
}

const hasErrors = _loadingErrors.length > 0;
if (hasErrors) {
  console.error(JSON.stringify(_loadingErrors));
}

export const errors = _loadingErrors;

export const indexId = config ? config.indexId : undefined;

export const kendra = !hasErrors
  ? new Kendra({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      region: config.region,
    })
  : undefined;

export const s3 = !hasErrors
  ? new S3({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      region: config.region,
    })
  : undefined;
