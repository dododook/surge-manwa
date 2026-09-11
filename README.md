# 漫蛙签到 · Surge 模块

每日自动签到 https://manwari.cc ，领取积分。

## 安装

Surge → 模块 → 安装：

```
https://raw.githubusercontent.com/dododook/surge-manwa/main/Surge/manwa.sgmodule
```

参数：

| 参数 | 说明 |
|---|---|
| `CronExp` | 签到时间，默认 `10 8 * * *`（每天 08:10） |
| `Type` | `lucky` 试试手气（1~15 积分） / `fixed` 普通签到（固定 5 积分） |
| `Host` | 站点域名，默认 `manwari.cc`。换域名只改这里 |

打开模块、MitM、脚本，并允许系统通知。

## 抓登录态

1. 开着 Surge，Safari 登录漫蛙
2. 打开一次签到页 `/checkin` 或底部「我的」
3. 通知「登录态已保存」后，可关掉「漫蛙_Cookie」，只留每天的 cron

登录失效后再开抓包脚本，重新进一次签到页即可。

## 手动测试

Surge → 脚本 → 漫蛙_签到 → 执行。
