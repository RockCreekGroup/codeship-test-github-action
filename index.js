const core = require('@actions/core');
const github = require('@actions/github');
const fetch = require("isomorphic-fetch");
const btoa = require("btoa");
const baseUrl = `https://api.codeship.com/v2`;
const organization = core.getInput('organization-id') || process.env.organizationId
const project = core.getInput('project-id') || process.env.projectId
const user = core.getInput('user') || process.env.user
const password = core.getInput('password') || process.env.password
const timeout = 3 * 60 * 60 * 1000;
const pollInterval = 60 * 1000;

const sleep = (s) => {
  return new Promise((resolve) => setTimeout(resolve, s * 1000));
};

const getToken = async () => {
  const res = await fetch(`${baseUrl}/auth`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Basic ${btoa(
        `${user}:${password}`
      )}`,
    },
  });
  if (!res.ok) {
    throw Error("Authentication Failed");
  }
  const x = await res.json();
  return x.access_token;
};

const getList = async (token) => {
  const res = await fetch(
    `${baseUrl}/organizations/${organization}/projects/${project}/builds`,
    {
      method: "GET",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
    }
  );

  return await res.json();
};

const createBuild = async (token) => {
  const res = await fetch(
    `${baseUrl}/organizations/${organization}/projects/${project}/builds`,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        ref: "heads/master",
      }),
    }
  );
  return await res.text();
};

const getBuild = async (token, id) => {
  const res = await fetch(
    `${baseUrl}/organizations/${organization}/projects/${project}/builds/${id}`,
    {
      method: "GET",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
    }
  );
  return (await res.json()).build;
};

const getLastMasterBuild = async (token) => {
  const list = await getList(token);
  return list.builds.find((build) => build.ref === "heads/master");
};

const pollForTestResult = async (token, id) => {
  console.log(`polling for build ${id}`);
  for (let time = 0; time < timeout; time += pollInterval) {
    console.log(`polling, ${time / 60000} mins have elapsed`);
    await sleep(pollInterval / 1000);
    const build = await getBuild(token, id);
    console.log(`build status: ${build.status}`);
    if (build.status === "success") {
      console.log("build succeeded");
      return { success: true, ...build };
    }
    if (build.status === "failed") {
      throw Error(`build failed`);
    }
  }
  throw Error(`build did not complete in time.`);
};

const main = async () => {
  try {
  const token = await getToken();
  await createBuild(token);
  // wait 10 seconds for the build to come up.
  await sleep(10);
  const lastBuild = await getLastMasterBuild(token);

  await pollForTestResult(token, lastBuild.uuid);
  } catch (error){
    core.setFailed(error.message)
  }
};

main()