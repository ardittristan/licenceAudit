require("dotenv").config();

const { Octokit } = require("@octokit/rest");
const { throttling } = require("@octokit/plugin-throttling");
const { retry } = require("@octokit/plugin-retry");
const asyncForEach = require("for-async-each");
const { existsSync, mkdirSync, readdirSync, writeFileSync, readFileSync } = require("fs");

if (!existsSync(__dirname + "/api")) {
  mkdirSync(__dirname + "/api");
}

const MyOctokit = Octokit.plugin(throttling, retry);

const octokit = new MyOctokit({
  auth: process.env.GITHUB_TOKEN,

  userAgent: "LicenceHistory v1.0.0",

  throttle: {
    onRateLimit: (retryAfter, options, octokit) => {
      octokit.log.warn(`Request quota exhausted for request ${options.method} ${options.url}`);

      if (options.request.retryCount === 0) {
        // only retries once
        octokit.log.info(`Retrying after ${retryAfter} seconds!`);
        return true;
      }
    },
    onAbuseLimit: (retryAfter, options, octokit) => {
      // does not retry, only logs a warning
      octokit.log.warn(`Abuse detected for request ${options.method} ${options.url}`);
    },
  },
  retry: {
    doNotRetry: ["429"],
  },
});

/**
 * @param {String} owner
 * @param {String} repo
 * @param {String} [path="LICENSE"]
 */
async function getData(owner, repo, path = "LICENSE") {
  let oldCommits = [];
  /** @type {{data: [{login: String}]}} */
  const { data: contributors } = await octokit.repos.listContributors({
    owner: owner,
    repo: repo,
  });

  /** @type {{data: [{html_url: String, author: {login: String}, committer: {login: String}, commit: {author: {date: String}}}]}} */
  const { data: licenceCommits } = await octokit.repos.listCommits({
    owner: owner,
    repo: repo,
    path: path,
  });

  const lastLicenceCommit = Date.parse(licenceCommits[licenceCommits.length - 1].commit.author.date);

  await asyncForEach(contributors, async (contributor) => {
    if (contributor.login !== owner) {
      /** @type {{data: [{html_url: String, author: {login: String}, committer: {login: String}, commit: {author: {date: String}}}]}} */
      const { data: commits } = await octokit.repos.listCommits({
        owner: owner,
        repo: repo,
        author: contributor.login,
      });

      commits.forEach((commit) => {
        if (lastLicenceCommit > Date.parse(commit.commit.author.date)) {
          oldCommits.push({ user: contributor.login, commit: commit.html_url });
        }
      });
    }
  });

  writeFileSync(`${__dirname}/api/${owner} ${repo}.json`, JSON.stringify(oldCommits));
}

/**
 *
 * ░██████╗███████╗██████╗░██╗░░░██╗███████╗██████╗░
 * ██╔════╝██╔════╝██╔══██╗██║░░░██║██╔════╝██╔══██╗
 * ╚█████╗░█████╗░░██████╔╝╚██╗░██╔╝█████╗░░██████╔╝
 * ░╚═══██╗██╔══╝░░██╔══██╗░╚████╔╝░██╔══╝░░██╔══██╗
 * ██████╔╝███████╗██║░░██║░░╚██╔╝░░███████╗██║░░██║
 * ╚═════╝░╚══════╝╚═╝░░╚═╝░░░╚═╝░░░╚══════╝╚═╝░░╚═╝
 *
 */

const express = require("express");
const hbs = require("express-handlebars");
const multer = require("multer");
const encodeUrl = require("encodeurl");
const https = require("https")

const app = express();
const upload = multer();

app.use("/api", express.static(__dirname + "/api"));
app.set("views", __dirname + '/views')

app.set("view engine", "hbs");

app.engine(
  "hbs",
  hbs({
    extname: "hbs",
  })
);

app.get("/", function (req, res) {
  res.render("index", {
    layout: false,
    checkedRepos: (() => {
      let out = [];
      try {
        readdirSync(__dirname + "/api").forEach((path) => {
          const name = path.match(/[^\/]*(?=\.json)/)?.[0];

          if (name) {
            out.push({
              url: `/api/${encodeUrl(path)}`,
              author: name.split(" ")[0],
              name: name.split(" ")[1],
            });
          }
        });
      } catch {}
      return out;
    })(),
  });
});

app.post("/send", upload.none(), async function (req, res) {
  try {
    await getData(req.body.owner, req.body.repo, req.body.path);
    res.redirect(req.get("referer"));
  } catch {
    res.sendStatus(500);
  }
});

https.createServer({
  key: readFileSync(process.env.KEY_PATH),
  cert: readFileSync(process.env.CERT_PATH)
}, app).listen(6756)
