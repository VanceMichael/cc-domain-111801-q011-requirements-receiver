# RequirementsReceiver

RequirementsReceiver 为业务资料员提供视图引用领取与原文保管，已支持来源目录预览、直接记录领取、客户对象身份、编辑权限、需求与证据类型以及按业务范围形成收件记录。引用对象沿来源声明的关系定向收齐：未获准看的目标留下带来源的未解析关系，视图开放后可补收且不重复产生需求对象；枚举定义先更新时标注定义缺口，不按显示文字硬转。引用目标只作只读依据，与可回传修改清单分开保存，便于复查来源内容。

## 环境与运行

使用 Node.js 22.23.4，依赖版本由 `package-lock.json` 固定。仅使用 Node.js 内置模块，无需外部数据库进程或第三方运行服务。

```sh
npm ci
npm run build
npm test
npm run demo
```

`npm run demo` 在本机启动合作源，用独立临时目录完成真实领取、原文保存和领域接收，输出实际结果后清理；不要求外网资料。`npm start` 可单独启动本地来源供交互查看，终端会打印实际回环地址，Ctrl-C 关闭。通过 `PORT` 指定监听端口，省略或设置为 `0` 时自动分配；仅监听回环地址。根路径返回可用资源目录与运行状态。

## 容器

```sh
docker build -t requirements-receiver:local .
docker run --rm --network none requirements-receiver:local
```

镜像构建时准备依赖，容器运行时不联网，演示只使用回环通信。可改用 `docker run --rm --network none requirements-receiver:local npm test` 运行回归。存储通过 `Archive` 传入本机目录，不包含生产账号、真实业务资料或凭据。

## 代码与来源约定

`src/source.mjs` 负责来源目录、对象关系与枚举定义入口及原文身份，`src/interpret.mjs` 解释当前领域记录、关系资料与枚举定义，`src/receiving.mjs` 决定选定范围内的收件结果、只读证据判定与定义相容性。`src/archive.mjs` 提供原文保管及收据、关系观察落库，`src/app.mjs` 连接日常业务并产出交付审阅的结果，`fixtures/` 与 `src/fixture-source.mjs` 提供可独立复查的本地合作源。详细字段与来源声明见 `docs/source-contract.md`。
