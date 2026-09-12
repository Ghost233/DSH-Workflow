# R70：关闭候选reservation入口与重放绕过

修R69 P1/P2。直接Owner启动及恢复/finish入口在接入专用生命周期前拒绝候选reservation；启动最新状态再查。重放中性化前要求真实task pending/running。真实控制socket、直接调用和持久重放测试。主线程独占写入，代理只读审查。

审查依据更正：公开V2 socket已有legacy守卫，不存在已声称的公开P1；本轮实际关闭内部Runtime门禁P2及重放P2。
