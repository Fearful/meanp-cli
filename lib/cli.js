'use strict';

var fs = require('fs'),
    npm = require('npm'),
    shell = require('shelljs'),
    chalk = require('chalk'),
    cliVersion = require('../package').version;

var moduleType = {
    contrib: 'Contrib',
    custom: 'Custom'
};

function Progress() {
    var interval, counter;

    function printMsg() {
        switch (counter) {
            case 0:
                console.log('Use `meanp --help` from command line for all CLI options');
                break;
            case 1:
                console.log('Make things that matter. Make sense.');
                break;
            case 2:
                console.log('-----------------------------------------');
                break;
            case 15:
                console.log('Seems a bit slow. Check your internet connection...');
                break;
            default:
                console.log('Still cloning...');
                break;
        }
        counter++;
    }

    return {
        start: function() {
            counter = 0;
            interval = setInterval(printMsg, 3000);
        },
        stop: function() {
            clearInterval(interval);
        }
    };
}
var progress = new Progress();

// From express
function emptyDirectory(path, callback) {
    fs.readdir('./' + path, function(err, files) {
        if (err && 'ENOENT' !== err.code) throw err;
        callback(!files || !files.length);
    });
}

function ensureEmpty(path, force, callback) {
    emptyDirectory(path, function(empty) {
        if (empty || force) {
            callback();
        } else {
            console.log(chalk.yellow('Destination is not empty:'), path);
        }
    });
}

function getPackageInfo(type, data) {
    if (!data) return;
    var author = data.author ? chalk.green('  Author: ') + data.author.name : '';
    return chalk.green('   ' + type + ': ') + data.name + '@' + data.version + author;
}

function loadPackageJson(path, callback) {
    fs.readFile(path, function(err, data) {
        if (err) return callback(err);

        try {
            var module = JSON.parse(data.toString());
            module.meanpVersion = module.meanp || module.version;
            callback(null, module);
        } catch (err) {
            return callback(err);
        }
    });
}

function checkVersion() {
    console.log();
    console.log('    checking meanp command line version');

    npm.load(function(err, npm) {
        npm.config.set('global', true);
        npm.config.set('loglevel', 'warn');
        npm.commands.outdated('meanp', true, function(err, list) {
            if (err) {
                console.log(chalk.red('Error: npm install failed'));
                return console.error(err);
            }
            var latest = list[2]; // list[2] holds the 'latest' value
            if (latest < cliVersion) {
                console.log(chalk.yellow('    meanp command line is out of date'));
                console.log('    Current: ' + cliVersion + ' Latest: ' + latest);
            } else {
                console.log(chalk.green('    meanp command line at latest version:'), cliVersion);
            }
        });
    });
}

function requiresRoot(callback) {
    loadPackageJson(process.cwd() + '/package.json', function(err, data) {

        if (err || data.name !== 'meanp-seed') {
            console.log(chalk.yellow('Invalid meanp app or not in app root'));
        } else {
            callback();
        }
    });
}

function mongoConnect(env, callback) {

    loadPackageJson('./package.json', function(err, data) {
        var path = '/api/config/config.js';

        var config = require(process.cwd() + path);

        require('mongodb').MongoClient.connect(config.db, function(err, db) {
            if (err) {
                console.log(chalk.red('    Error Connecting to database'));
                console.log(err);
            } else {
                console.log(chalk.green('    DB connection successful!'));
                console.log();
                callback(err, db);
            }
        });
    });
}

exports.list = function() {
    requiresRoot(function() {
        console.log(chalk.green('   meanp Packages List:'));
        console.log('   -----------------');

        function look(type) {
            var path = './public/modules';
            fs.readdir(path, function(err, files) {
                if (err || !files.length) return console.log(chalk.yellow('   No ' + type + ' Packages'));
                files.forEach(function(file) {
                    loadPackageJson(path + '/' + file + '/package.json', function(err, data) {
                        if (!err && data.meanp) console.log(getPackageInfo(type, data));
                    });
                });
            });
        }
        // look in packages for local packages
        look(moduleType.custom);
    });
};

exports.status = function(options) {
    requiresRoot(function() {
        console.log();
        console.log(chalk.green('    meanp Status'));
        console.log('    -----------');
        console.log();
        loadPackageJson('./package.json', function(err, data) {
            console.log('    meanp VERSION: ' + data.meanpVersion);
            console.log();
            mongoConnect(options.env, function(err, db) {
                console.log('    MongoDB URI: ' + db.options.url);
                checkVersion();
                db.close();
            });
        });
    });
};

exports.module = function(name, options) {
    requiresRoot(function() {
        if (options.delete) {
            console.log(chalk.yellow('Removing package:'), name);
            shell.rm('-rf', './packages/' + name);
        } else {
            ensureEmpty('./packages/' + name, options.force, function() {
                require('./scaffold.js').modules(name, options);
            });
        }
    });
};

exports.printUser = function(email, options) {
    requiresRoot(function() {
        mongoConnect(options.env, function(err, db) {
            db.collection('users').find({
                email: email
            }).toArray(function(err, user) {
                console.dir(user);
                db.close();
            });
        });
    });
};

exports.updateRole = function(email, options, type) {
    requiresRoot(function() {
        var update = {};
        switch (type) {
            case 'a':
                console.log(chalk.green('  Adding role `' + options.addRole + '` to user `' + email + '`'));
                update.$push = {
                    roles: options.addRole
                };
                break;
            case 'r':
                console.log(chalk.green('  Removing role `' + options.removeRole + '` from user `' + email + '`'));
                update.$pull = {
                    roles: options.removeRole
                };
                break;
            default:
                return;
        }
        mongoConnect(options.env, function(err, db) {
            db.collection('users').update({
                email: email
            }, update, {
                w: 1,
                upsert: false,
                multi: false
            }, function(err) {
                if (err) console.error(err);
                else console.log(chalk.green('successfully updated'));
                db.close();
            });
        });
    });
};
