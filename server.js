const express = require('express');
const bodyParser = require('body-parser');
const simpleGit = require('simple-git');
const {
    exec
} = require('child_process');
const chokidar = require('chokidar');
const fs = require('fs');
const ini = require('ini');
const path = require('path');

const REPO_DIR = path.join(__dirname, 'repos');
const APP_DIR = '/apps'; // Directory where repos are stored
const repos = {};

// Ensure /apps directory exists
if (!fs.existsSync(APP_DIR)) {
    fs.mkdirSync(APP_DIR, {
        recursive: true
    });
}
const loadSettings = () => {
    fs.readdirSync(REPO_DIR).forEach(file => {
        if (file.endsWith('.ini')) {
            const filePath = path.join(REPO_DIR, file);
            const config = ini.parse(fs.readFileSync(filePath, 'utf-8'));
            const projectName = path.basename(file, '.ini');
            repos[projectName] = {
                repo: config.repo,
                token: config.token,
                branch: config.branch,
                run: config.run ? JSON.parse(config.run.replace(/'/g, '"')) : []
            };
        }
    });
    console.log('Loaded repos:', repos);
};

const runCommandsSequentially = (commands, repoDir, callback) => {
    if (commands.length === 0) return callback?.();

    const runNext = (index) => {
        if (index >= commands.length) return callback?.();

        const cmd = commands[index];
        console.log(`Running: ${cmd} in ${repoDir}`);

        exec(cmd, {
            cwd: repoDir
        }, (err, stdout, stderr) => {
            if (err) {
                console.error(`Error running ${cmd}:`, err.message);
                // return;
            }
            if (stdout) console.log(stdout);
            if (stderr) console.error(stderr);

            runNext(index + 1);
        });
    };

    runNext(0);
};

const pullOrCloneRepo = (repoName, repoConfig, callback) => {
    const repoDir = path.join(APP_DIR, repoName);
    const gitUrl = repoConfig.repo.replace('https://', `https://${repoConfig.token}@`);
    const branch = repoConfig.branch || 'main'; // ถ้าไม่ระบุ branch จะใช้ 'main' เป็นค่าเริ่มต้น

    if (!fs.existsSync(repoDir)) {
        fs.mkdirSync(repoDir, {
            recursive: true
        });
    }

    if (fs.existsSync(path.join(repoDir, '.git'))) {
        console.log(`Pulling latest changes for ${repoName} on branch ${branch}...`);
        const git = simpleGit(repoDir);
        git.fetch('origin', branch, (fetchErr) => {
            if (fetchErr) {
                console.error(`Git fetch error: ${fetchErr.message}`);
                return;
            }

            git.status((statusErr, status) => {
                if (statusErr) {
                    console.error(`Git status error: ${statusErr.message}`);
                    return;
                }

                if (status.behind > 0) {
                    console.log(`${repoName} is behind by ${status.behind} commits. Pulling changes...`);
                    git.pull('origin', branch, (err, update) => {
                        if (err) console.error(`Git pull error: ${err.message}`);
                        else if (update && update.summary.changes) {
                            console.log(`${repoName} updated.`);
                            runCommandsSequentially(repoConfig.run, repoDir, callback);
                        } else {
                            runCommandsSequentially(repoConfig.run, repoDir, callback);
                        }
                    });
                } else {
                    console.log(`${repoName} is already up to date on branch ${branch}.`);
                    runCommandsSequentially(repoConfig.run, repoDir, callback);
                }
            });
        });

    } else {
        console.log(`Removing invalid directory: ${repoDir}`);
        fs.rmSync(repoDir, {
            recursive: true,
            force: true
        });

        console.log(`Cloning ${repoName} into ${repoDir} on branch ${branch}...`);
        simpleGit().clone(gitUrl, repoDir, ['-b', branch], (err) => {
            if (err) return console.error(`Git clone error: ${err.message}`);
            console.log(`${repoName} cloned.`);
            runCommandsSequentially(repoConfig.run, repoDir, callback);
        });
    }
};


const startAllApps = () => {
    console.log('Starting all apps...');

    const repoNames = Object.keys(repos);
    const startNextApp = (index) => {
        if (index >= repoNames.length) {
            console.log('All apps started.');
            return;
        }

        const repoName = repoNames[index];
        const repoConfig = repos[repoName];

        console.log(`Initializing ${repoName}...`);
        pullOrCloneRepo(repoName, repoConfig, () => {
            console.log(`${repoName} started.`);
            startNextApp(index + 1);
        });
    };

    startNextApp(0);
};

const app = express();
app.use(bodyParser.json());

app.post('/webhook', (req, res) => {
    const { repository, ref } = req.body;

    if (!repository || !ref) {
        return res.status(400).send('Invalid webhook payload');
    }

    const repoName = repository.name;
    const repoConfig = repos[repoName];

    if (!repoConfig) {
        return res.status(404).send(`No config found for ${repoName}`);
    }

    // ดึงชื่อ branch จาก ref เช่น 'refs/heads/main' => 'main'
    const branch = ref.replace('refs/heads/', '');
    const targetBranch = repoConfig.branch || 'main';

    if (branch !== targetBranch) {
        console.log(`Branch ${branch} does not match target branch ${targetBranch}. Skipping pull.`);
        return res.send(`No update needed for ${repoName} on branch ${branch}`);
    }

    console.log(`Branch ${branch} matched. Pulling updates for ${repoName}...`);
    pullOrCloneRepo(repoName, repoConfig, () => {
        console.log(`${repoName} updated from webhook.`);
    });

    res.send(`Processing update for ${repoName} on branch ${branch}`);
});


// Watch for changes in /repos directory
chokidar.watch(`${REPO_DIR}/*.ini`).on('change', (filePath) => {
    console.log(`Config file changed: ${filePath}`);
    loadSettings();
    startAllApps(); // Restart all apps when .ini files change
});

// Initial setup
loadSettings();
startAllApps();

app.listen(9009, () => {
    console.log('Webhook server running on port 9009');
});
