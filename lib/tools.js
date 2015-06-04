/**
 * Created by Hisune on 2015/6/1.
 * User: hi@hisune.com
 */
var crypto = require('crypto');

// 获取请求头数组
exports.getHeader = function(data)
{
    var header = {};

    data = data.toString().split('\r\n');
    for (var i = 0; i < data.length; i++) {
        var index = data[i].indexOf(':');
        if (index > 0) {
            var key = data[i].substr(0, index);
            var value = data[i].substr(index + 1);
            header[key.trim()] = value.trim();
        }
    }

    return header;
};

// 验证头部是否合法
exports.checkHeader = function(header)
{
    return header['Connection'].toLowerCase().indexOf('upgrade') != -1  && header['Upgrade'].toLowerCase() == 'websocket';
};

// 获取响应string
exports.getHandshake = function(header)
{
    var sha = crypto.createHash('sha1');
    var salt = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"; // 这个salt是固定的
    sha.update(header['Sec-WebSocket-Key'] + salt, 'ascii');

    var response = 'HTTP/1.1 101 Switching Protocols\r\n';
    response += 'Upgrade: ' + header['Upgrade'] + '\r\n';
    response += 'Connection: ' + header['Connection'] + '\r\n';
    response += 'Sec-WebSocket-Accept: ' + sha.digest('base64') + '\r\n';
    response += 'WebSocket-Origin: ' + header['Origin'] + '\r\n';
    response += 'WebSocket-Location: ' + header['Host'] + '\r\n';
    response += '\r\n';

    return response;
};

// 获取数据帧格式数组
exports.getProtocol = function(data)
{
    var protocol = {
        start : 2, // mask key 的起始index，头2字节是fin,rsv,opcode,mask,payload len，后面的长度根据payload len来定
        msg : '' // 消息内容
    };

    // 第一个字节
    protocol.fin = this.getOneBit(data[0], 0x80); // 1位，分片，是否是最后一片
    protocol.rsv1 = this.getOneBit(data[0], 0x40); // 1位，通常为0
    protocol.rsv2 = this.getOneBit(data[0], 0x20); // 1位，通常为0
    protocol.rsv3 = this.getOneBit(data[0], 0x10); // 1位，通常为0
    if(protocol.rsv1 != 0 || protocol.rsv2 != 0 || protocol.rsv3 != 0){ // 这三个bit必须为0
        return false;
    }
    protocol.opcode = data[0] & 0x0f; // 4位，0 代表一个继续帧 1 代表一个文本帧 2 代表一个二进制帧 3-7 保留用于未来的非控制帧 8 代表连接关闭 9 代表ping A 代表pong B-F 保留用于未来的控制帧
    // 第二个字节
    protocol.mask = this.getOneBit(data[1], 0x80); // 1位，是否经过掩码，从客户端发送到服务器的所有帧有这个位设置为1
    protocol.payload_len = data[1] & 0x7f; // 7位，如果是 0-125，这是负载长度；如果是 126，之后的两字节解释为一个16位的无符号整数是负载长度；如果是127，之后的8字节解释为一个64位的无符号整数是负载长度
    // 根据payload_len判断负载长度
    if(protocol.payload_len >= 0 && protocol.payload_len <= 125){
        protocol.len = protocol.payload_len; // 就是他自己
    }else if(protocol.payload_len == 126){
        protocol.start += 2;
        protocol.len = (data[2] << 8) + data[3]; // 后16位，2字节
    }else if(protocol.payload_len == 127){
        if(data[2] != 0 || data[3] != 0 || data[4] != 0 || data[5] != 0){ // 头4个字节必须为0
            return false;
        }
        protocol.start += 8;
        protocol.len = data.readUInt32BE(6);  // 后64位，8字节，仅支持后面4字节(4GB已经足够了。。。)
    }else{
        return false;
    }
    // 获取mask key
    if(protocol.mask){
        protocol.mask_key = data.slice(protocol.start, protocol.start + 4);
        protocol.start += 4; // 去除mask key 本身的4字节长度
    }else{ // 必须有mask key
        return false;
    }

    return protocol;
};

// 获取数据内容
exports.getMessage = function(data, protocol)
{
    var bufLen = data.length - protocol.start; // 可能的数据长度
    if(bufLen > protocol.len){ // 考虑混合帧的情况，如果可能的数据长度已经超过了之前协议定义的剩余数据长度，表示这个帧里面包含继续帧的协议内容
        bufLen = protocol.len; // 将buffer长度定义为剩余数据长度
        protocol.data = data.slice(bufLen); // 更新data的内容，slice后的data为新的协议帧内容
        protocol.sliced = true; // 标明这是一个混合帧
    }else{
        protocol.sliced = false; // 标明这是一个混合帧
    }

    var buffer = new Buffer(bufLen);
    for (var i = protocol.start, j = 0, k = protocol.msg.length; i < data.length; i++, j++, k++) {
        //对每个字节进行异或运算
        buffer[j] = data[i] ^ protocol.mask_key[k % 4];
    }

    protocol.len = protocol.len - bufLen; // 考虑分配情况，需要减去上次计算的数据长度
    protocol.start = 0; // 后面分片的数据开始未知为0
    protocol.msg += buffer.toString(); // msg的拼接
};

// 获取二进制的某一位值
exports.getOneBit = function(data, hex)
{
    return (data & hex) == hex ? 1 : 0;
};

// 组装消息内容
exports.getSend = function(text)
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
        buffer.writeUInt32BE(0, 2); // 高4字节, 全部为0
        buffer.writeUInt32BE(length & 4294967295, 6); // 低4字节, 2^32 - 1
    } else if (length > 125) {
        buffer[1] = 0x7e; // 126

        // 长度超过125, 2个字节长度
        buffer.writeUInt16BE(length, 2);
    } else {
        buffer[1] = length;
    }

    buffer.write(text, index);
    return buffer;
};