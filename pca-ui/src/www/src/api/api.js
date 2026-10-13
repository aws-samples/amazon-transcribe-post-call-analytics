import * as auth from "./auth.js";

const config = window.pcaSettings;

function handleError(err) {
  if(err) console.error(err);
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

export async function genaiquery(filename, query) {
  return getRequest(`genaiquery`, {
    "filename": filename,
    "query": query
  } );
}

export async function genairefresh(filename) {
  return getRequest("genai/refreshsummary", {
    "filename": filename,
  } );
}

export async function presign(filename) {
  return getRequest("presign", {
    "filename": filename,
  } );
}

export async function deleteCall(key) {
  return request(`${config.api.uri}/delete/${key}`, "DELETE");
}

export async function deleteBatchCalls(callIds) {
  return request(`${config.api.uri}/delete/batch`, "POST", { callIds });
}

export async function getPermissions() {
  return getRequest("me/permissions");
}

export async function listRoles() {
  return getRequest("roles");
}

export async function createRole(name, permissions) {
  return request(`${config.api.uri}/roles`, "POST", { roleName: name, permissions });
}

export async function updateRole(name, permissions) {
  return request(`${config.api.uri}/roles/${encodeURIComponent(name)}`, "PUT", { permissions });
}

export async function deleteRole(name) {
  return request(`${config.api.uri}/roles/${encodeURIComponent(name)}`, "DELETE");
}

export async function listUsers() {
  return getRequest("users");
}

export async function assignUserRole(username, roleName) {
  return request(`${config.api.uri}/users/${encodeURIComponent(username)}/role`, "PUT", { roleName });
}
