# R72

修复 R71 终态 reservation 配对 P2，覆盖实际 lease/save、领取和执行重放。保留 launching 在 Owner finish 完成后、reservation 结算前的合法过渡。主线程独占 helper/合同/证据，测试 worker 仅拥有 candidate-independent-runtime.test.mjs。正式范围：独立 Runtime、独立 selector、candidate pause、control；每套180秒串行，保留真实内部隔离。开发完成后冻结并独立审查。T15仍开发中。
