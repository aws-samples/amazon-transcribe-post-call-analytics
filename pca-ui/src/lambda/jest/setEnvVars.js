const OLD_ENV = process.env;
process.env = {
  ...OLD_ENV,
  TABLE: "table",
  INDEX: "index",
  ORIGIN: "*",
  CORS_HEADERS: "PUT, GET, OPTIONS",
};
