/**
 * Created by Hisune on 2015/6/1.
 * User: hi@hisune.com
 *
 * 客户端管理
 */
var clients = function()
{
    this.list = []; // 客户端列表
};

clients.prototype.push = function(client)
{
    if(this.get(client)){
        this.remove(client);
    }
    this.list.push(client);
};

clients.prototype.get = function(client)
{
    return this.list[this.list.indexOf(client)];
};

clients.prototype.remove = function(client)
{
    this.list.splice(this.list.indexOf(client), 1);
};

module.exports = clients;