/**
 * Created by Hisune on 2015/5/28.
 * User: hi@hisune.com
 */
var crypto = require('crypto');

var websocket = function()
{
    this.clients = []; // 客户端列表
};

// 解析头部
websocket.prototype.renderHeader = function(client, data, next)
{
    var header = {};
    var c = this.getClient(client);
    if(typeof c.ws['id'] == 'undefined'){
        data = data.toString().split('\r\n');
        for (var i = 0; i < data.length; i++) {
            var index = data[i].indexOf(':');
            if (index > 0) {
                var key = data[i].substr(0, index);
                var value = data[i].substr(index + 1);
                header[key.trim()] = value.trim();
            }
        }
        c.ws['header'] = header;
        c.ws['id'] = header['Sec-WebSocket-Key'];
    }

    return header;
};

// 生成握手返回
websocket.prototype.renderHandshake = function(header)
{
    if(Object.keys(header).length > 0){
        var sha = crypto.createHash('sha1');
        var salt = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"; // 这个salt是固定的
        sha.update(header['Sec-WebSocket-Key'] + salt, 'ascii');

        var response = 'HTTP/1.1 101 Web Socket Protocol Handshake\r\n';
        response += 'Upgrade: ' + header['Upgrade'] + '\r\n';
        response += 'Connection: ' + header['Connection'] + '\r\n';
        response += 'Sec-WebSocket-Accept: ' + sha.digest('base64') + '\r\n';
        response += 'WebSocket-Origin: ' + header['Origin'] + '\r\n';
        response += 'WebSocket-Location: ' + header['Host'] + '\r\n';
        response += '\r\n';
        return response;
    }else
        return null;
};

// 解析协议内容，包括分片数据
websocket.prototype.renderProtocol = function(client, data)
{
    var c = this.getClient(client).ws;
    if(typeof c.protocol == 'undefined'){ // 如果有分配，这个是第一个数据帧
        this.start(c);
        // 字节1
        c.protocol.fin = (data[0] & 0x80) == 0x80 ? 1 : 0; // 1位，分片，是否是最后一片
        c.protocol.rsv1 = (data[0] & 0x40) == 0x40 ? 1 : 0; // 1位，通常为0
        c.protocol.rsv2 = (data[0] & 0x20) == 0x20 ? 1 : 0; // 1位，通常为0
        c.protocol.rsv3 = (data[0] & 0x10) == 0x10 ? 1 : 0; // 1位，通常为0
        c.protocol.opcode = data[0] & 0x0f; // 4位，0 代表一个继续帧 1 代表一个文本帧 2 代表一个二进制帧 3-7 保留用于未来的非控制帧 8 代表连接关闭 9 代表ping A 代表pong B-F 保留用于未来的控制帧
//console.log('opcode--->' + c.protocol.opcode);
        switch(c.protocol.opcode){
            case 1:
                break;
            case 9:
                this.ping(client);
                return true;
            case 10:
                this.pong(client);
                return true;
            case 8:
                this.close(client);
                return true;
            default:
                this.close(client);
                return true;
        }
        // 字节2
        c.protocol.mask = (data[1] & 0x80) == 0x80 ? 1 : 0; // 1位，是否经过掩码，从客户端发送到服务器的所有帧有这个位设置为1
        c.protocol.payload_len = data[1] & 0x7f; // 7位，如果是 0-125，这是负载长度；如果是 126，之后的两字节解释为一个16位的无符号整数是负载长度；如果是127，之后的8字节解释为一个64位的无符号整数是负载长度
        // 根据payload_len判断负载长度
        if(c.protocol.payload_len >= 0 && c.protocol.payload_len <= 125){
            c.protocol.len = c.protocol.payload_len; // 就是他自己
        }else if(c.protocol.payload_len == 126){
            c.protocol.start += 2;
            c.protocol.len = (data[2] << 8) + data[3]; // 后16位，2字节
        }else if(c.protocol.payload_len == 127){
            c.protocol.start += 8;
            c.protocol.len = (data[2] << 56) + (data[3] << 48) + (data[4] << 40) + (data[5] << 32) + (data[6] << 24) + (data[7] << 16) + (data[8] << 8) + data[9]; // 后64位，8字节
        }else{
            // 异常
            c.protocol.len = 0;
        }
        // 获取mask key 并 解析数据
        if(c.protocol.mask){
            c.protocol.mask_key = data.slice(c.protocol.start, c.protocol.start + 4);
            c.protocol.start += 4; // 去除mask key 本身的4字节长度
        }else{ // 客户端过来的消息必须有mask
            this.close(client);
            return true;
        }
    }

    // 处理数据内容
    c.protocol.buffer = new Buffer(data.length - c.protocol.start);
    for (var i = c.protocol.start, j = 0; i < data.length; i++, j++) {
        //对每个字节进行异或运算
        c.protocol.buffer[j] = data[i] ^ c.protocol.mask_key[j % 4];
    }

    c.protocol.len -= data.length - c.protocol.start; // 考虑分配情况，需要减去上次计算的数据长度
    c.protocol.start = 0; // 后面分片的数据开始未知为0
    c.protocol.msg += c.protocol.buffer.toString(); // msg的拼接

    console.log(c.protocol.len);
    if(c.protocol.len == 0){ // 如果分片结束了
        console.log(c.protocol.msg);
        this.broadcast(client, c.protocol.msg);
        this.reset(c);
    }
};

// 客户端初始化
websocket.prototype.start = function(socket)
{
    socket.protocol = {
        start : 2, // mask key 的起始index，头2字节是fin,rsv,opcode,mask,payload len，后面的长度根据payload len来定
        msg : '' // 消息内容
    };
};

// 分片处理结束后重置当前客户端
websocket.prototype.reset = function(socket)
{
    delete socket.protocol;
};

// 广播消息
websocket.prototype.broadcast = function(client, text)
{
    var length = this.clients.length;
    for(var i = 0; i < length; i++){
        if(this.clients[i] != client){
            console.log(text);
            this.send(this.clients[i], text);
        }
    }
};

// 发消息
websocket.prototype.send = function(client, text)
{
    var length = Buffer.byteLength(text);

    // 消息的起始位置2个固定字节 + 数据长度
    var index = 2 + (length > 65535 ? 8 : (length > 125 ? 2 : 0));

    // 整个数据帧的定义
    var buffer = new Buffer(index + length);

    // fin位=1，opcode=1：10000001
    buffer[0] = 0x81;

    //  因为是由服务端发至客户端，所以无需masked掩码
    if (length > 65535) {
        buffer[1] = 0x7f; // 127

        // 8个字节长度
        buffer.writeUInt32BE(length >> 48, 2);
        buffer.writeUInt32BE(length << 16, 6);
    } else if (length > 125) {
        buffer[1] = 0x7e; // 126

        // 长度超过125, 2个字节长度
        buffer.writeUInt16BE(length, 2);
    } else {
        buffer[1] = length;
    }

    buffer.write(text, index);
    client.write(buffer);
};

websocket.prototype.ping = function (socket)
{
    socket.write(new Buffer(['0x89', '0x0']))
};
websocket.prototype.pong = function ()
{
    socket.write(new Buffer(['0x8A', '0x0']))
};

websocket.prototype.pushClient = function(client)
{
    client.ws = {};
    this.clients.push(client);
};

websocket.prototype.getIndexOfClient = function(client)
{
    return this.clients.indexOf(client)
};

websocket.prototype.getClient = function(client)
{
    return this.clients[this.getIndexOfClient(client)];
};

// 关闭连接
websocket.prototype.close = function(client)
{
    this.clients.splice(this.getIndexOfClient(client), 1);
};

module.exports = websocket;