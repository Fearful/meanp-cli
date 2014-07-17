'use strict';

var path = require('path'),
    exec = require('child_process').exec;

var CMD = path.join(process.cwd(), 'bin', 'meanp');

describe('`meanp`', function() {

    it('executes without error', function(done) {
        exec(CMD, function(err) {
            if (err) {
                throw err;
            }
            done();
        });
    });

    ['', '--help', 'help'].forEach(function(args) {
        var suffix = args ? '"' + args + '"' : 'no arguments';
        it('shows help when executed with ' + suffix, function(done) {
            exec(CMD + ' ' + args, function(err, stdout) {
                if (err) {
                    throw err;
                }
                stdout.should.match(/Usage:\s+meanp/);
                done();
            });
        });
    });

});
