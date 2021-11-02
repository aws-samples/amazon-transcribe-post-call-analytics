import * as auth from "./auth.js";

const config = window.pcaSettings;

function handleError(err) {
  console.error(err);

  throw err;
}

async function request(url, method, body) {
  const options = {
    method: method || "GET",
    headers: {
      Authorization: await auth.getToken(),
    },
  };

  if (body !== null) {
    options.body = JSON.stringify(body);
    options.headers["Content-Type"] = "application/json";
  }

  let response;
  try {
    console.debug("Request opts:", JSON.stringify(options, null, 4));

    response = await fetch(url, options);
  } catch (err) {
    return handleError(err);
  }

  console.debug("Response:", response);

  if (response.status === 403 || response.status === 401) {
    return auth.redirectToLogin("Unathenticated.");
  }

  if (response.status !== 200) {
    return handleError(`not 200 ${response}`);
  }

  return response.json();
}

async function getRequest(resource, data) {
  const url = new URL(`${config.api.uri}/${resource}`);

  if (data != null) {
    for (const key in data) {
      url.searchParams.append(key, data[key]);
    }
  }

  return request(url.toString());
}

export async function get(key) {
  return getRequest(`get/${key}`);
}

export async function head(key) {
  return getRequest(`head/${key}`);
}

export async function search(query) {
  return getRequest("search", query);
}

export async function list(params) {
  return getRequest("list", params);
}

export async function swap(key) {
  return request(`${config.api.uri}/swap/${key}`, "PUT");
}

export async function entities(key) {
  return getRequest("entities");
}

export async function languages(key) {
  return getRequest("languages");
}
