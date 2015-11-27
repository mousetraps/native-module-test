var exec = require('child_process').exec;
var fs = require('fs');
var os = require('os');
var async = require('async');
var keypress = require('keypress');
var stripBom = require('strip-bom');

var queue = async.queue(npmInstall, 1);
var numPackages = 0;
var currentPackage = 1;

var file = fs.readFile('native-packages.json', 'utf-8', function (err, data) {
    data = JSON.parse(stripBom(data));
    numPackages = data.length;
    console.log("Number of native modules:", numPackages);
    for (var i = 0; i < numPackages; i++) {
        queue.push(data[i], function (err) {
        });
    }
});

var results = [];

listenToKeypressEvents();

queue.drain = function () {
    if (queue.length() === 0) {
        printAndWriteResults(results);
    }
};

function listenToKeypressEvents() {
    keypress(process.stdin);
    process.stdin.on('keypress', function (ch, key) {
        if (key && key.ctrl && key.name == 'c') {
            printAndWriteResults(results, function () {
                process.exit();
            });
        }
        if (key) {
            switch (key.name) {
                case "p":
                    printResultSummary(results);
                    break;
                case "w":
                    printAndWriteResults(results);
                    break;
            }
        }
    });
    
    process.stdin.setRawMode(true);
    process.stdin.resume();
}

function printAndWriteResults(results, callback) {
    writeResults(results, callback);
    printResultSummary(results);
}

function writeResults(results, callback) {
    var all = {
        "config": {
            "node-version": process.version,
            "node-arch": process.arch,
            "os-arch": os.arch(),
            "os-plat": os.platform(),
            "os-release": os.release()
        },
        "results": results
    };

    fs.writeFile("results.json", JSON.stringify(all), function (err) {
        if (err) {
            console.log(err);
        }
        if (callback) {
            callback();
        }
    });
}

function printResultSummary(results) {
    var passed = 0, known = 0, failed = 0;
    var fatalErrors = {};
    for (var packageInfo of results) {
        switch (packageInfo.result) {
            case "passed":
                passed++;
                break;
            case "knownIssue":
                known++;
                break;
            case "failed":
                failed++;
                break;
        }

        var fatalError = packageInfo.stdout.match(/\n.*fatal error.*\n/)
        if (fatalError) {
            if (!fatalErrors[fatalError]) {
                fatalErrors[fatalError] = 0;
            }
            fatalErrors[fatalError]++;
        }
    }

    console.log("========================================");
    console.log("unique fatal errors:", Object.keys(fatalErrors).length);
    for (var fatalError in fatalErrors) {
        console.log(">", fatalError, ":", fatalErrors[fatalError]);
    }
    console.log("passed:", passed);
    console.log("knownIssue:", known);
    console.log("failed:", failed);
    console.log("total modules:", Object.keys(results).length);
    console.log("========================================");
}

function npmInstall(packageName, callback) {
    var cmd = 'npm install ' + packageName + ' --msvs_version=2015 --loglevel error';

    exec(cmd, function (error, stdout, stderr) {
        var packageInfo = processNpmInstallOutput(packageName, cmd, error, stdout, stderr);
        if (packageInfo.result === "failed") {
            writeLogEntry(cmd, stderr, stdout);
        }
        callback();
    });
    
    if (currentPackage % 50 === 0) {
        printAndWriteResults(results);
    }
}

function processNpmInstallOutput(packageName, cmd, error, stdout, stderr) {
    console.log(currentPackage++ + "/" + numPackages + ": " + cmd);

    var packageInfo = {
        "name": packageName,
        "cmd": cmd,
        "stderr": stderr,
        "stdout": stdout,
        "result": "unassigned"
    };

    if (!error) {
        packageInfo.result = "passed";
    } else if (stderr.search('EBADPLATFORM') != -1
        || stdout.search("cannot open input file 'C:\\OpenSSL") != -1
        || stdout.search('conflicts with Standard Library function declaration') != -1
        || stdout.search("is not a member of 'v8") != -1
        || stdout.search("is not a member of 'node") != -1
        || stdout.search('is not recognized as an internal or external command') != -1
        || stderr.search('is not recognized as an internal or external command') != -1) {
        packageInfo.result = "knownIssue"
    } else {
        packageInfo.result = "failed";
    }

    results.push(packageInfo);
    return packageInfo;
}

function writeLogEntry(cmd, stderr, stdout) {
    fs.appendFile("log.txt",
        "\r\n=============================\r\nCMD: "
        + cmd + "\r\nSTDERR: " + stderr + "\r\nSTDOUT: " + stdout,

        function (err) {
            if (err) {
                console.log(err);
            }
        });

    console.log('===============================');
    console.log(stderr);
}