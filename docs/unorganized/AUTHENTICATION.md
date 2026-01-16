# 🔐 认证系统说明

## 为什么需要保护 Dashboard 路由？

### 1. **数据安全**
- Dashboard 包含敏感的测试统计数据（成功率、失败率、执行时长等）
- 这些数据可能包含业务敏感信息，不应该被未授权用户访问

### 2. **访问控制**
- 只有登录用户才能查看 Dashboard
- 可以追踪谁访问了哪些数据（通过 `req.user`）
- 为后续的权限控制（如按部门过滤数据）提供基础

### 3. **防止未授权访问**
- 没有认证保护的 API 可能被恶意调用
- 可能导致数据库查询压力过大
- 可能泄露系统内部信息

---

## 🔄 认证流程详解

### 步骤 1: 用户登录

**前端请求** (`src/services/authService.ts`):
```typescript
POST /api/auth/login
{
  "username": "admin",
  "password": "admin"
}
```

**后端处理** (`server/services/authService.ts`):
1. 查找用户：`prisma.users.findUnique({ where: { username } })`
2. 验证密码：`bcrypt.compare(password, user.password_hash)`
3. 生成 JWT Token：
   ```typescript
   jwt.sign({
     userId: user.id,
     username: user.username,
     email: user.email,
     isSuperAdmin: user.is_super_admin
   }, JWT_SECRET, { expiresIn: '7d' })
   ```
4. 返回用户信息和 Token

**响应**:
```json
{
  "success": true,
  "data": {
    "user": { "id": 1, "username": "admin", ... },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### 步骤 2: 前端存储 Token

前端将 Token 保存到 `localStorage`:
```typescript
localStorage.setItem('authToken', token);
```

### 步骤 3: 请求受保护的路由

**前端请求** (`src/services/dashboardService.ts`):
```typescript
GET /api/dashboard/stats
Headers: {
  "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### 步骤 4: 认证中间件验证

**中间件执行** (`server/middleware/authMiddleware.ts`):

```typescript
const authenticate = async (req, res, next) => {
  // 1. 检查 Authorization header
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: '未提供认证token'
    });
  }

  // 2. 提取 token
  const token = authHeader.substring(7); // 移除 "Bearer " 前缀

  // 3. 验证 token 并获取用户信息
  const user = await authService.getUserFromToken(token);

  // 4. 将用户信息附加到请求对象
  req.user = user;

  // 5. 继续处理请求
  next();
};
```

**Token 验证过程** (`server/services/authService.ts`):

```typescript
async getUserFromToken(token: string): Promise<AuthUser> {
  // 1. 验证 JWT token 签名和过期时间
  const payload = this.verifyToken(token);
  // verifyToken 内部使用: jwt.verify(token, JWT_SECRET)

  // 2. 从数据库查询用户（确保用户仍然存在）
  const user = await this.prisma.users.findUnique({
    where: { id: payload.userId }
  });

  if (!user) {
    throw new Error('用户不存在');
  }

  // 3. 返回用户信息
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    accountName: user.account_name,
    department: user.department,
    isSuperAdmin: user.is_super_admin
  };
}
```

### 步骤 5: 路由处理

**路由处理函数** (`server/routes/dashboard.ts`):
```typescript
router.get('/stats', async (req: Request, res: Response) => {
  // req.user 已经由中间件填充，可以直接使用
  // 例如：可以根据 req.user.department 过滤数据
  
  const todayExecutions = await prisma.test_runs.count({...});
  // ...
  
  res.json({ success: true, data: {...} });
});
```

---

## 📋 路由保护配置

### 在 `server/index.ts` 中配置：

```typescript
// 1. 创建认证中间件
const { authenticate } = createAuthMiddleware(prisma);

// 2. 应用中间件保护路由
app.use('/api/dashboard', authenticate, createDashboardRoutes(prisma));
```

**说明**:
- `authenticate` 中间件会在所有 `/api/dashboard/*` 路由之前执行
- 如果认证失败，请求会被拦截，不会到达路由处理函数
- 如果认证成功，`req.user` 会被填充，路由处理函数可以直接使用

---

## 🔑 JWT Token 结构

### Token Payload:
```json
{
  "userId": 1,
  "username": "admin",
  "email": "admin@test.local",
  "isSuperAdmin": true,
  "iat": 1234567890,  // 签发时间
  "exp": 1234567890   // 过期时间（7天后）
}
```

### Token 特点:
- **无状态**: 服务器不需要存储 session，所有信息都在 token 中
- **可验证**: 使用 `JWT_SECRET` 签名，防止被篡改
- **有过期时间**: 默认 7 天，过期后需要重新登录
- **包含用户信息**: 减少数据库查询次数

---

## 🛡️ 安全措施

### 1. **密码加密**
- 使用 `bcrypt` 加密存储密码
- 即使数据库泄露，密码也无法直接使用

### 2. **Token 签名**
- 使用 `JWT_SECRET` 签名 token
- 只有知道密钥的服务器才能验证 token

### 3. **Token 过期**
- 默认 7 天过期
- 过期后需要重新登录

### 4. **用户验证**
- 即使 token 有效，也会从数据库查询用户
- 如果用户被删除，token 会失效

---

## 🔧 配置说明

### 环境变量 (`.env`):
```bash
# JWT 密钥（生产环境必须修改！）
JWT_SECRET=your_random_256_bit_secret_here

# Token 过期时间
JWT_EXPIRES_IN=7d  # 可选: 7d, 24h, 30m
```

### 安全建议:
1. **生产环境必须修改 `JWT_SECRET`**
2. 使用足够长的随机字符串（至少 32 位）
3. 定期轮换密钥（需要所有用户重新登录）
4. 使用 HTTPS 传输 token（防止中间人攻击）

---

## 📝 使用示例

### 前端发送认证请求:
```typescript
// 获取 token
const token = localStorage.getItem('authToken');

// 发送请求
const response = await fetch('/api/dashboard/stats', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

### 后端访问用户信息:
```typescript
router.get('/stats', authenticate, async (req, res) => {
  // 访问当前登录用户
  const currentUser = req.user;
  console.log(`用户 ${currentUser.username} 访问了统计数据`);
  
  // 可以根据用户权限过滤数据
  if (!currentUser.isSuperAdmin) {
    // 普通用户只能看到自己部门的数据
    // ...
  }
  
  res.json({ success: true, data: {...} });
});
```

---

## ❌ 常见错误

### 1. "未提供认证token"
- **原因**: 请求头中没有 `Authorization` header
- **解决**: 确保前端发送请求时包含 `Authorization: Bearer {token}`

### 2. "无效的token"
- **原因**: Token 已过期或被篡改
- **解决**: 重新登录获取新 token

### 3. "用户不存在"
- **原因**: Token 有效但用户已被删除
- **解决**: 重新登录

---

## 🔗 相关文件

- **认证服务**: `server/services/authService.ts`
- **认证中间件**: `server/middleware/authMiddleware.ts`
- **认证路由**: `server/routes/auth.ts`
- **Dashboard 路由**: `server/routes/dashboard.ts`
- **前端认证服务**: `src/services/authService.ts`
- **前端 Dashboard 服务**: `src/services/dashboardService.ts`

