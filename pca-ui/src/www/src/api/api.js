import * as auth from "./auth.js";

const config = window.pcaSettings;

function handleError(err) {
  console.debug(err);

  alert("Network error. Please try reloading the page.");
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

const itemCache = {};
const headerCache = {};

export function invalidate(key) {
  delete itemCache[key];
  delete headerCache[key];
}

export async function get(key) {
  if (key in itemCache) {
    return itemCache[key];
  }

  const result = getRequest(`get/${key}`);
  itemCache[key] = result;
  return result;
}

export async function head(key) {
  if (key in headerCache) {
    return headerCache[key];
  }

  const result = getRequest(`head/${key}`);
  headerCache[key] = result;
  return result;
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
