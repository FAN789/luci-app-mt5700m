'use strict';
'require baseclass';
'require fs';

// Read coalescing never caches SMS bodies or settings across requests.
var pending = Object.create(null);
function read(args) {
    var key = JSON.stringify(args);
    if (pending[key]) return pending[key];
    pending[key] = fs.exec('/usr/sbin/mt5700m-read', args).then(function(r) {
        if (!r || r.code !== 0) throw new Error(r && r.stderr || '读取失败，请稍后重试');
        return r;
    });
    return pending[key].then(function(r) { delete pending[key]; return r; }, function(e) { delete pending[key]; throw e; });
}
function values(raw) {
    var data = {};
    String(raw || '').split('\n').forEach(function(line) { var at = line.indexOf('='); if (at > 0) data[line.slice(0, at)] = line.slice(at + 1); });
    return data;
}
function age(stamp) {
    var seconds = Math.floor(Date.now() / 1000 - Number(stamp));
    return Number(stamp) > 0 && seconds >= 0 ? seconds : null;
}
function ageText(stamp) {
    var seconds = age(stamp);
    return seconds === null ? '采样时间未知' : seconds < 60 ? seconds + ' 秒前' : Math.floor(seconds / 60) + ' 分钟前';
}
// Only one in-flight request per timer, no catch-up storm after a hidden tab.
function watch(root, seconds, task, tick) {
    var mounted = false, stopped = false, busy = false, timer, next = 0;
    function stop() { stopped = true; clearTimeout(timer); document.removeEventListener('visibilitychange', visible); }
    function visible() { if (!document.hidden) { next = 0; step(); } }
    function step() {
        clearTimeout(timer);
        if (stopped) return;
        if (!root.isConnected) { if (mounted) return stop(); timer = setTimeout(step, 100); return; }
        mounted = true;
        if (!document.hidden && !busy && Date.now() >= next) {
            busy = true;
            next = Date.now() + seconds * 1000;
            Promise.resolve().then(task).catch(function() {}).then(function() {
                busy = false;
                if (next < Date.now()) next = Date.now() + seconds * 1000;
            });
        }
        if (tick) tick(document.hidden ? null : busy ? 0 : Math.max(0, Math.ceil((next - Date.now()) / 1000)));
        timer = setTimeout(step, 1000);
    }
    document.addEventListener('visibilitychange', visible);
    timer = setTimeout(step, 0);
    return { stop: stop, refresh: function() { next = 0; step(); } };
}
function lazy(title, load) {
    var loaded = false, busy = false, box = E('div', {'class':'mt-lazy-body'});
    var detail = E('details', {'class':'mt-ui-details mt-lazy', toggle: function() { if (detail.open && !loaded) fetch(); }}, [E('summary', {}, title), box]);
    function fetch() {
        if (busy) return;
        busy = true; box.replaceChildren(E('p', {'class':'spinning'}, '正在读取…'));
        Promise.resolve().then(load).then(function(node) { loaded = true; box.replaceChildren(node); }, function() {
            box.replaceChildren(E('p', {'class':'mt-read-error', role:'status'}, '读取失败，未修改任何设置。'), E('button', {'class':'btn', click:fetch}, '重试'));
        }).then(function() { busy = false; });
    }
    return detail;
}
function defer(definition, title) {
    var load = definition.load, render = definition.render;
    definition.load = function() { return Promise.resolve(); };
    definition.render = function() {
        var self = this, root = E('div', {'class':'mt-ui-page mt-async-shell'}, [style(), E('h2', {}, title)]);
        var state = E('div', {'class':'mt-loading', role:'status'}, '正在读取，页面已就绪…'); root.appendChild(state);
        var busy = false;
        function refresh() {
            if (busy) return;
            busy = true;
            state.replaceChildren(E('p', {'class':'spinning'}, '正在读取…'));
            Promise.resolve().then(function() { return load.call(self); }).then(function(data) {
                return render.call(self, data);
            }).then(function(node) { if (root.isConnected) root.replaceChildren(node); }, function() {
                if (root.isConnected) state.replaceChildren(E('p', {}, '读取失败，设备状态未知；没有更改设置。'), E('button', {'class':'btn', click:refresh}, '重试'));
            }).then(function() { busy = false; });
        }
        setTimeout(refresh, 0);
        return root;
    };
    return definition;
}
function signal(root, render, failed, tick) {
    return watch(root, 5, function() {
        return read(['signal']).then(function(r) {
            var data = values(r.stdout), seconds = age(data.sampled_at);
            if (!data.sysmode || seconds === null || seconds > 30) throw new Error('信号缓存已过期');
            if (root.isConnected && !document.hidden) render(data);
        }).catch(function() { if (root.isConnected) failed(); });
    }, tick);
}
function style() { return E('link', {rel:'stylesheet', href:L.resource('mt5700m/ux.css') + '?v=20261031-1'}); }
return baseclass.extend({read:read,values:values,age:age,ageText:ageText,watch:watch,lazy:lazy,defer:defer,signal:signal,style:style});
