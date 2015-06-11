# Nodejs Websocket server
## What is this?

这是一个简单的websocket协议服务端实现。

This is a simple demo about websocket protocol.

数据分片、多数据包数据也已经实现！

测试兼容Chrome/Firefox/IE11。

## How to use?

> node app

## A simple client?
```js
if ("WebSocket" in window) {
	console.log("WebSocket is supported by your Browser!");
	var ws = new WebSocket("ws://127.0.0.1:4000/");
	ws.onopen = function () {
		console.log('open');
	};
	ws.onmessage = function (msg) {
		var receive = msg.data;
		console.log("Message is received...");
		display(receive, false);
	};
	ws.onclose = function () {
		console.log("Connection is closed...");
	};
} else {
	console.log("WebSocket NOT supported by your Browser!");
}

function send()
{
	console.log("Message is sent...");
	var str = document.getElementById('msg').value;
	console.log(str.length);
	ws.send(str);
	display(str, true);
	document.getElementById('msg').value = '';
}

function display(msg, send)
{
	var div = document.createElement('div');

	if(send)
		div.innerHTML = 'Me: ' + msg;
	else
		div.innerHTML = 'Somebody: ' + msg;

	document.getElementById('content').appendChild(div);
}
```

(http://hisune.com/view/36/websocket-protocol-nodejs-server-client)

Code by Hisune [lyx](http://hisune.com)
