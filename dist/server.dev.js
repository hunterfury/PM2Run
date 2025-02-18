"use strict";

var express = require('express');

var bodyParser = require('body-parser');

var simpleGit = require('simple-git');

var _require = require('child_process'),
    exec = _require.exec;

var chokidar = require('chokidar');

var fs = require('fs');

var ini = require('ini');

var path = require('path');

var REPO_DIR = path.join(__dirname, 'repos');
var APP_DIR = 'apps'; // Directory where repos are stored

var repos = {}; // Ensure /apps directory exists

if (!fs.existsSync(APP_DIR)) {
  fs.mkdirSync(APP_DIR, {
    recursive: true
  });
}

var loadSettings = function loadSettings() {
  fs.readdirSync(REPO_DIR).forEach(function (file) {
    if (file.endsWith('.ini')) {
      var filePath = path.join(REPO_DIR, file);
      var config = ini.parse(fs.readFileSync(filePath, 'utf-8'));
      var projectName = path.basename(file, '.ini');
      repos[projectName] = {
        repo: config.repo,
        token: config.token,
        run: config.run ? JSON.parse(config.run.replace(/'/g, '"')) : []
      };
    }
  });
  console.log('Loaded repos:', repos);
};

var app = express();
app.use(bodyParser.json());
app.post('/webhook', function (req, res) {
  var repository = req.body.repository;

  if (!repository) {
    return res.status(400).send('Invalid webhook payload');
  }

  var repoName = repository.name;
  var repoConfig = repos[repoName];

  if (!repoConfig) {
    return res.status(404).send("No config found for ".concat(repoName));
  }

  var repoDir = path.join(APP_DIR, repoName); // Ensure the directory exists before using simple-git

  if (!fs.existsSync(repoDir)) {
    fs.mkdirSync(repoDir, {
      recursive: true
    });
  }

  var gitUrl = repoConfig.repo.replace('https://', "https://".concat(repoConfig.token, "@"));

  var pullOrClone = function pullOrClone() {
    if (fs.existsSync(path.join(repoDir, '.git'))) {
      console.log("Pulling latest changes for ".concat(repoName, "..."));
      var git = simpleGit(repoDir);
      git.pull(function (err, update) {
        if (err) console.error("Git pull error: ".concat(err.message));else if (update && update.summary.changes) {
          console.log("".concat(repoName, " updated."));
          runCommands(repoConfig.run, repoDir);
        }
      });
      console.log('End pull.');
    } else {
      console.log("Removing invalid directory: ".concat(repoDir));
      fs.rmSync(repoDir, {
        recursive: true,
        force: true
      });
      console.log("Cloning ".concat(repoName, " into ").concat(repoDir, "..."));
      simpleGit().clone(gitUrl, repoDir, {}, function (err) {
        if (err) return console.error("Git clone error: ".concat(err.message));
        console.log("".concat(repoName, " cloned."));
        runCommands(repoConfig.run, repoDir);
      });
    }
  };

  pullOrClone();
  res.send("Processing update for ".concat(repoName));
});

var runCommands = function runCommands(commands, repoDir) {
  if (commands.length === 0) return;

  var runNext = function runNext(index) {
    if (index >= commands.length) return;
    var cmd = commands[index];
    console.log("Running: ".concat(cmd, " in ").concat(repoDir));
    exec(cmd, {
      cwd: repoDir
    }, function (err, stdout, stderr) {
      if (err) {
        console.error("Error running ".concat(cmd, ":"), err.message);
        return;
      }

      if (stdout) console.log(stdout);
      if (stderr) console.error(stderr); // Run next command after the previous one completes

      runNext(index + 1);
    });
  };

  runNext(0);
}; // Watch for changes in /repos directory


chokidar.watch("".concat(REPO_DIR, "/*.ini")).on('change', function (filePath) {
  console.log("Config file changed: ".concat(filePath));
  loadSettings();
}); // Initial load

loadSettings();
app.listen(9009, function () {
  console.log('Webhook server running on port 9009');
});