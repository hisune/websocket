/**
 * Created by Hisune on 2015/5/28.
 * User: hi@hisune.com
 */
var websocket = require('./lib/websocket');
websocket = new websocket;
var server = require('net').createServer().listen(3000);

server.on('connection', function(client){
    websocket.pushClient(client);
    console.log('-->hello');

    client.on('data', function (data) {
        console.log('-->data');
        var header = websocket.renderHeader(client, data);
        var response = websocket.renderHandshake(header);
        if(response)
            client.write(response, 'ascii');
        else
            websocket.renderProtocol(client, data);
    });

    client.on('end', function(){
        console.log('-->bye');
        websocket.close(client);
    });
});

