'use strict';

var express = require('express'),
    Grid = require('gridfs-stream'),
    errorHandler = require('errorhandler'),
    config = require('meanp').loadConfig(),
    fs = require('fs'),
    appPath = process.cwd();

var meanp = require('meanp');

module.exports = function(options, db) {

    // Register app dependency;
    meanp.register('app', function(access, database) {
        require(appPath + '/config/express')(app, access.passport, database.connection);
        return app;
    });


    // Express settings
    var app = express();

    var gfs = new Grid(db.connection.db, db.mongo);


    function themeHandler(req, res) {

        res.setHeader('content-type', 'text/css');

        gfs.files.findOne({
            filename: 'theme.css'
        }, function(err, file) {

            if (!file) {
                fs.createReadStream(config.root + '/bower_components/bootstrap/dist/css/bootstrap.css').pipe(res);
            } else {
                // streaming to gridfs
                var readstream = gfs.createReadStream({
                    filename: 'theme.css'
                });

                //error handling, e.g. file does not exist
                readstream.on('error', function(err) {
                    console.log('An error occurred!', err.message);
                    throw err;
                });

                readstream.pipe(res);
            }
        });
    }

    // We override this file to allow us to swap themes
    // We keep the same public path so we can make use of the bootstrap assets
    app.get('/bower_components/bootstrap/dist/css/bootstrap.css', themeHandler);

    app.use('/modules', express.static(config.root + '/modules'));
    
    app.use('/bower_components', express.static(config.root + '/bower_components'));

    return app;
};
