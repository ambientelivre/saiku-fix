/*  
 *   Copyright 2012 OSBI Ltd
 *
 *   Licensed under the Apache License, Version 2.0 (the "License");
 *   you may not use this file except in compliance with the License.
 *   You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 *   Unless required by applicable law or agreed to in writing, software
 *   distributed under the License is distributed on an "AS IS" BASIS,
 *   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *   See the License for the specific language governing permissions and
 *   limitations under the License.
 */
 
/**
 * Node.js proxy for Saiku
 *
 * Use this proxy to develop for the UI without having to install the server.
 * Requests will be proxied to try.meteorite.bi,
 * or a Saiku server installation of your choice.
 * 
 * To play with the chaos monkey, set the CHAOS_MONKEY environment variable
 * to anything (Preferably a nice name for your chaos monkey).
 * 
 * To start the server in HTTP mode,
 * run `node server.js [port] [backend_host] [backend_port]`
 *
 * To start the server in HTTPS mode, you will need generate a self-signed 
 * certificate, run the following commands in your shell:
 * 
 * $ [sudo] openssl genrsa -out key.pem
 * $ [sudo] openssl req -new -key key.pem -out csr.pem
 * $ [sudo] openssl x509 -req -days 9999 -in csr.pem -signkey key.pem -out cert.pem
 * $ [sudo] rm csr.pem
 *
 * run `node server.js https [port] [backend_host] [backend_port]`
 */

// newer versions of node.js use the lower-case argv
var argv = process.ARGV || process.argv;

var http = require('http');
var https = require('https');
var fs = require('fs');
var express = require('express');
var path = require('path');
var app = express();
var port;
var backend_host;
var backend_port;
var backend_path_prefix;
var auth;

if (argv[2] === 'https') {
    port = process.env.C9_PORT || parseInt(argv[3], 10) || 8080;
    backend_host = argv[4] || 'try.meteorite.bi';
    backend_port = parseInt(argv[5], 10) || 80;
    backend_path_prefix = argv[6] || '';
    auth = argv[7] || null;
}
else {
    port = process.env.C9_PORT || parseInt(argv[2], 10) || 8080;
    backend_host = argv[3] || 'try.meteorite.bi';
    backend_port = parseInt(argv[4], 10) || 80;
    backend_path_prefix = argv[5] || '';
    auth = argv[6] || null;
}

// Load static server
var twoHours = 1000 * 60 * 60 * 2;
app.use(express['static'](__dirname));

var standard_prefix = '/saiku/rest/saiku/';

// Proxy request
function get_from_proxy(request, response) {

    // if a path prefix is set, remove the existing one
    if (backend_path_prefix !== '') {
      if (request.url.indexOf(standard_prefix) === 0) {
        request.url = backend_path_prefix + request.url.substr(standard_prefix.length);
      }
    }

    if (auth) {
        request.headers['authorization']     = 'Basic ' + new Buffer(auth).toString('base64');
        request.headers['www-authorization'] = 'Basic ' + new Buffer(auth).toString('base64');
        delete request.headers['cookie'];
    }

    var options = {
        hostname : backend_host,
        port     : backend_port,
        path     : request.url,
        method   : request.method,
        headers  : request.headers
    };

    console.log(options.method, options.path);
    
    var proxy_request = http.request(options);
    request.addListener('data', function(chunk) {
        proxy_request.write(chunk, 'binary');
    });
    request.addListener('end', function() {
        proxy_request.end();
    });
    
    proxy_request.addListener('error', function (error) {
        console.log('ERROR:', error);
    });    
    proxy_request.addListener('response', function (proxy_response) {
        proxy_response.addListener('data', function(chunk) {
            response.write(chunk, 'binary');
        });
        
        proxy_response.addListener('end', function() {
                response.end();
        });
        response.writeHead(proxy_response.statusCode, proxy_response.headers);
    });
}

// Unleash the chaos monkey!
function unleash_chaos_monkey(request, response) {
    var monkey = 'The chaos monkey strikes again!';
    response.writeHead(500, {
        'Content-Type': 'text/plain',
        'Content-Length': monkey.length
    });
    response.write(monkey);
    response.end();
}

// Handle incoming requests
app.all('/saiku/*', function(request, response) {
    request.headers.host = backend_host;
    get_from_proxy(request, response);
});

if (argv[2] === 'https') {
    var options = {
        key: fs.readFileSync('key.pem'),
        cert: fs.readFileSync('cert.pem')
    };

    https.createServer(options, app).listen(port, function () {
       console.log('Started!');
    });
}
else {
    app.listen(port, '0.0.0.0');
}

console.log('Connected to "', backend_host, ':', backend_port, '"');
console.log('Proxy listening on', port);
