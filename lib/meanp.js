'use strict';

var swig = require('swig'),
    mongoose = require('mongoose'),
    container = require('dependable').container(),
    fs = require('fs'),
    _ = require('lodash'),
    path = require('path'),
    util = require('./util'),
    crypto = require('crypto'),
    uglify = require('uglify-js'),
    EventEmitter = require('events').EventEmitter;

var events = new EventEmitter(),
    meanp, modules = [],
    menus, config,
    allMenus = [],
    middleware = {
        before: {},
        after: {}
    },

    aggregated = {
        header: {
            js: {
                data: null,
                weights: []
            },
            css: {
                data: null,
                weights: []
            }
        },
        footer: {
            js: {
                data: null,
                weights: [],
            },
            css: {
                data: null,
                weights: [],
            }
        }
    };

function meanp() {
    if (this.active) return;
    Meanp = this;
    this.events = events;
    this.version = require('../package').version;
}

meanp.prototype.serve = function(options, callback) {

    if (this.active) return this;

    // Initializing system variables
    var defaultConfig = util.loadConfig();

    var database = mongoose.connect(defaultConfig.db || '', function(err) {
        if (err) {
            console.error('Error:', err.message);
            return console.error('**Could not connect to MongoDB. Please ensure mongod is running and restart MEAN app.**');
        }

        // Register database dependency
        Meanp.register('database', {
            connection: database
        });

        Meanp.config = new Config(function(err, config) {
            // Bootstrap Models, Dependencies, Routes and the app as an express app
            var app = require('./bootstrap')(options, database);

            // Start the app by listening on <port>, optional hostname
            app.listen(config.port, config.hostname);

            findModules(function() {
                enableModules();
            });

            aggregate('js', null);

            Meanp.name = config.app.name;
            Meanp.app = app;

            menus = new Meanp.Menus();
            Meanp.menus = menus;

            callback(app, config);
        });

        Meanp.active = true;
        Meanp.options = options;
    });
};

meanp.prototype.loadConfig = util.loadConfig;

function Config(callback) {

    if (this.config) return this.config;

    loadSettings(this, callback);

    function update(settings, callback) {

        var Module = loadModuleModel();

        if (!Module) return callback(new Error('failed to load data model'));

        Module.findOneAndUpdate({
            name: 'config'
        }, {
            $set: {
                settings: settings,
                updated: new Date()
            }
        }, {
            upsert: true,
            multi: false
        }, function(err, doc) {
            if (err) {
                console.log(err);
                return callback(new Error('Failed to update settings'));
            }

            loadSettings(Meanp.config);

            return callback(null, doc.settings);
        });
    }

    function loadSettings(Config, callback) {

        var Module = loadModuleModel();

        var defaultConfig = util.loadConfig();

        if (!Module) return defaultConfig;

        Module.findOne({
            name: 'config'
        }, function(err, doc) {

            var original = JSON.flatten(defaultConfig, {
                default: true
            });

            var saved = JSON.flatten(doc ? doc.settings : defaultConfig, {});

            var merged = mergeConfig(original, saved);

            var clean = JSON.unflatten(merged.clean, {});

            var diff = JSON.unflatten(merged.diff, {});

            Config.verbose = {
                clean: clean,
                diff: diff,
                flat: merged
            };

            Config.clean = clean;
            Config.diff = diff;
            Config.flat = merged;
            if (callback) callback(err, clean);
        });
    }

    function mergeConfig(original, saved) {

        var clean = {};

        for (var index in saved) {
            clean[index] = saved[index].value;
            if (original[index]) {
                original[index].value = saved[index].value;
            } else {
                original[index] = {
                    value: saved[index].value,
                };
            }

            original[index]['default'] = original[index]['default'] || saved[index]['default'];
        }

        return {
            diff: original,
            clean: clean
        };
    }

    function loadModuleModel() {

        var database = container.get('database');
        if (!database || !database.connection) {
            return null;
        }

        if (!database.connection.models.Module) {
            require('../modules/modules')(database);
        }

        return database.connection.model('Module');
    }

    this.update = update;

}

meanp.prototype.status = function() {
    return {
        active: this.active,
        name: this.name
    };
};

meanp.prototype.register = container.register;

meanp.prototype.resolve = container.resolve;

//confusing names, need to be refactored asap
meanp.prototype.load = container.get;

meanp.prototype.aggregated = function(ext, group, callback) {
    // Aggregated Data already exists and is ready
    if (aggregated[group][ext].data) return callback(aggregated[group][ext].data);

    // No aggregated data exists so we will build it
    sortAggregateAssetsByWeight();

    // Returning rebuild data. All from memory so no callback required
    callback(aggregated[group][ext].data);
};

// Allows redbuilding aggregated data
meanp.prototype.rebuildAggregated = function() {
    sortAggregateAssetsByWeight();
};

function lowerCaseFirstLetter(string) {
    return string.charAt(0).toLowerCase() + string.slice(1);
}

function sortAggregateAssetsByWeight() {
    for (var region in aggregated) {
        for (var ext in aggregated[region]) {
            sortByWeight(region, ext);
        }
    }
}

function sortByWeight(group, ext) {
    var weights = aggregated[group][ext].weights;
    var temp = [];

    for (var file in weights) {
        temp.push({
            data: weights[file].data,
            weight: weights[file].weight
        });
    }
    aggregated[group][ext].data = _.map(_.sortBy(temp, 'weight'), function(value) {
        return value.data;
    }).join('\n');
}

function aggregate(ext, asset, options) {
    options = options || {};

    var ugly = null,
        group = options.group,
        weight = options.weight || 0;

    //Allow libs
    var libs = true;
    if (asset) {
        return options.inline ? addInlineCode(ext, asset) : readFile(ext, path.join(process.cwd(), asset));
    }

    //Deny Libs
    libs = false;
    events.on('modulesFound', function() {
        for (var name in modules) {
            readFiles(ext, path.join(process.cwd(), modules[name].source, name.toLowerCase(), 'public'));
        }
    });

    function readFiles(ext, filepath) {
        fs.readdir(filepath, function(err, files) {
            if (err) return;
            files.forEach(function(file) {
                if (!libs && (file !== 'assets' && file !== 'tests')) {
                    readFile(ext, path.join(filepath, file));
                }
            });
        });
    }

    function pushAggregatedData(ext, filename, data) {
        if (ext === 'js') {

            group = options.group || 'footer';

            var code = options.global ? data.toString() + '\n' : '(function(){' + data.toString() + '})();';

            ugly = uglify.minify(code, {
                fromString: true,
                mangle: false
            });

            aggregated[group][ext].weights[filename] = {
                weight: weight,
                data: ugly.code
            };

        } else {
            group = options.group || 'header';

            aggregated[group][ext].weights[filename] = {
                weight: weight,
                data: data.toString()
            };

        }
    }

    function addInlineCode(ext, data) {

        var md5 = crypto.createHash('md5');
        md5.update(data);
        var hash = md5.digest('hex');
        pushAggregatedData(ext, hash, data);

    }


    function readFile(ext, filepath) {
        fs.readdir(filepath, function(err, files) {
            if (files) return readFiles(ext, filepath);
            if (path.extname(filepath) !== '.' + ext) return;
            fs.readFile(filepath, function(fileErr, data) {
                if (!data) {
                    readFiles(ext, filepath);
                } else {
                    var filename = filepath.split(process.cwd())[1];
                    pushAggregatedData(ext, filename, data);
                }
            });
        });
    }
}

meanp.prototype.chainware = {

    add: function(event, weight, func) {
        middleware[event].splice(weight, 0, {
            weight: weight,
            func: func
        });
        middleware[event].join();
        middleware[event].sort(function(a, b) {
            if (a.weight < b.weight) {
                a.next = b.func;
            } else {
                b.next = a.func;
            }
            return (a.weight - b.weight);
        });
    },

    before: function(req, res, next) {
        if (!middleware.before.length) return next();
        this.chain('before', 0, req, res, next);
    },

    after: function(req, res, next) {
        if (!middleware.after.length) return next();
        this.chain('after', 0, req, res, next);
    },

    chain: function(operator, index, req, res, next) {
        var args = [req, res,
            function() {
                if (middleware[operator][index + 1]) {
                    this.chain('before', index + 1, req, res, next);
                } else {
                    next();
                }
            }
        ];

        middleware[operator][index].func.apply(this, args);
    }
};

module.exports = exports = new meanp();