'use strict';

var fs = require('fs'),
    shell = require('shelljs'),
    chalk = require('chalk');

var data = {};

function capitaliseFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

function camelCase(str) {
    str = str.toLowerCase();
    var parts = str.split(/[\-_ \s]/);
    str = null;
    for (var i = 0; i < parts.length; i++) {
        str = (str ? str + capitaliseFirstLetter(parts[i]) : parts[i]);
    }
    return str;
}

/**
 * echo str > path.
 *
 * @param {String} path
 * @param {String} str
 */
function write(path, str) {
    fs.writeFile(path, str);
    console.log(chalk.cyan('   file was created:'), path);
}

/**
 * Read template files
 *
 * @param {String} path
 */
function readTemplate(path) {
    var template = fs.readFileSync(__dirname + '/templates/' + path, 'utf8');
    for (var index in data) {
        template = template.split('__' + index + '__').join(data[index]);
    }
    return template;
}

/**
 * Mkdir -p.
 *
 * @param {String} path
 * @param {Function} fn
 */
function mkdir(path, fn) {
    shell.mkdir('-p', path);
    shell.chmod(755, path);
    console.log(chalk.cyan('   directory was created:'), path);
    if (fn) fn();
}

function buildDirectoryStructure() {
    var name = data.name;
    var source = 'modules';
    if (data.version < '0.3.2') source = 'node_modules';
    var path = './public/modules/';
    console.log('Files saved in /public/modules/' + data.moduleName);
    mkdir(path + data.moduleName, function() {
        write(path + data.moduleName + '/app.js', readTemplate('app.js'));
        write(path + data.moduleName + '/package.json', readTemplate('package.json'));
        //write(path + data.moduleName + '/README.md', 'README: ' + name);
    });
    mkdir(path + data.moduleName +'/assets');
    mkdir(path + data.moduleName +'/assets/css', function() {
        write(path + data.moduleName +'/assets/css/' + name + '.css', readTemplate('assets/css/main.css'));
    });
    mkdir(path + data.moduleName +'/controllers', function() {
        write(path + data.moduleName +'/controllers/' + name + '.js', readTemplate('controllers/main.js'));
    });
    mkdir(path + data.moduleName +'/directives');
    mkdir(path + data.moduleName +'/services', function() {
        write(path + data.moduleName +'/services/' + name + '.js', readTemplate('services/factory.js'));
    });
    mkdir(path + data.moduleName +'/views', function() {
        write(path + data.moduleName +'/views/index.html', readTemplate('views/main.html'));
    });
}

exports.modules = function(name, options) {

    var module = require(process.cwd() + '/package.json');
    var camelName = camelCase(name);

    data = {
        moduleName: name.toLowerCase(),
        name: camelName,
        class: capitaliseFirstLetter(camelName),
        author: (typeof options.author === 'string' ? options.author : 'meanp scaffold'),
        version: module.meanp || module.version
    };

    console.log('Go to public/modules/' + data.name + '/ and you will find your new module');

    buildDirectoryStructure();
};
