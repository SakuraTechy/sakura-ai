import React, { useState } from 'react';
import { Form, Input, Button, Alert, Modal } from 'antd';
import { User, Lock, Mail, Building } from 'lucide-react';
import { motion } from 'framer-motion';
import { authService } from '../services/authService';

interface RegisterProps {
  onSwitchToLogin: () => void;
  onRegisterSuccess: () => void;
}

export const Register: React.FC<RegisterProps> = ({ onSwitchToLogin, onRegisterSuccess }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (values: {
    email: string;
    username: string;
    password: string;
    confirmPassword: string;
    accountName?: string;
    department?: string;
  }) => {
    setError(null);

    if (values.password !== values.confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    if (values.password.length < 6) {
      setError('密码长度至少6位');
      return;
    }

    setLoading(true);

    try {
      await authService.register({
        email: values.email,
        username: values.username,
        password: values.password,
        accountName: values.accountName,
        department: values.department
      });
      Modal.success({
        title: '注册成功',
        content: '请使用注册的用户名进行登录',
        onOk: onRegisterSuccess
      });
    } catch (err: any) {
      setError(err.message || '注册失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8 }}
      className="w-full max-w-md mx-auto"
    >
      {/* Logo 和标题 */}
      <motion.div
        className="flex flex-col items-center mb-16 py-4"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.8 }}
      >
        <div className="w-[110px] h-[110px] mb-0 flex items-center justify-center">
          <img
            src="/logo1.svg"
            alt="Sakura Logo"
            className="w-full h-full object-contain"
          />
        </div>
        <h1 className="text-4xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-purple-300 via-purple-200 to-purple-100 drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]">
          Sakura AI
        </h1>
        <p className="text-sm font-light tracking-[0.15em] bg-clip-text text-transparent bg-gradient-to-r from-purple-300/90 via-purple-200/80 to-purple-100/90 drop-shadow-[0_0_4px_rgba(168,85,247,0.4)]">
          企业级 · 一站式智能自动化平台
        </p>
      </motion.div>

      {/* 注册卡片 */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="backdrop-blur-xl bg-white/10 rounded-3xl p-8 shadow-2xl border border-white/20"
      >
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <Alert
              message={error}
              type="error"
              closable
              onClose={() => setError(null)}
              className="login-alert rounded-xl"
            />
          </motion.div>
        )}

        <Form
          form={form}
          onFinish={handleSubmit}
          layout="vertical"
          requiredMark={false}
          className="space-y-4"
        >
          <Form.Item
            name="email"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '请输入有效的邮箱地址' }
            ]}
            className="login-input"
          >
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-10">
                <Mail className="w-5 h-5 text-purple-300 group-hover:text-purple-200 transition-colors" />
              </div>
              <Input
                placeholder="邮箱"
                autoComplete="email"
                className="h-14 pl-12 pr-4 rounded-xl transition-all"
              />
            </div>
          </Form.Item>

          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
            className="login-input"
          >
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-10">
                <User className="w-5 h-5 text-purple-300 group-hover:text-purple-200 transition-colors" />
              </div>
              <Input
                placeholder="用户名"
                autoComplete="username"
                className="h-14 pl-12 pr-4 rounded-xl transition-all"
              />
            </div>
          </Form.Item>

          <Form.Item
            name="accountName"
            rules={[{ required: true, message: '请输入姓名' }]}
            className="login-input"
          >
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-10">
                <User className="w-5 h-5 text-purple-300 group-hover:text-purple-200 transition-colors" />
              </div>
              <Input
                placeholder="姓名"
                autoComplete="name"
                className="h-14 pl-12 pr-4 rounded-xl transition-all"
              />
            </div>
          </Form.Item>

          <Form.Item
            name="department"
            rules={[{ required: true, message: '请输入部门' }]}
            className="login-input"
          >
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-10">
                <Building className="w-5 h-5 text-purple-300 group-hover:text-purple-200 transition-colors" />
              </div>
              <Input
                placeholder="部门"
                className="h-14 pl-12 pr-4 rounded-xl transition-all"
              />
            </div>
          </Form.Item>

          <Form.Item
            name="password"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, message: '密码长度至少6位' }
            ]}
            className="login-input"
          >
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-10">
                <Lock className="w-5 h-5 text-purple-300 group-hover:text-purple-200 transition-colors" />
              </div>
              <Input.Password
                placeholder="密码"
                autoComplete="new-password"
                className="h-14 pl-12 pr-4 rounded-xl transition-all"
              />
            </div>
          </Form.Item>

          <Form.Item
            name="confirmPassword"
            rules={[{ required: true, message: '请确认密码' }]}
            className="login-input"
          >
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-10">
                <Lock className="w-5 h-5 text-purple-300 group-hover:text-purple-200 transition-colors" />
              </div>
              <Input.Password
                placeholder="确认密码"
                autoComplete="new-password"
                className="h-14 pl-12 pr-4 rounded-xl transition-all"
              />
            </div>
          </Form.Item>

          <Form.Item className="mb-0">
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                block
                className="login-button h-14 rounded-xl text-base font-semibold transition-all"
              >
                {loading ? '注册中...' : '注 册'}
              </Button>
            </motion.div>
          </Form.Item>
        </Form>

        {/* 切换登录 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="mt-6 pt-4 border-t border-white/10 text-center"
        >
          <span className="text-purple-300/60 text-sm">
            已有账号？
          </span>
          <Button
            type="link"
            onClick={onSwitchToLogin}
            className="text-purple-300 hover:text-purple-200 ml-2 p-0 h-auto text-sm"
          >
            立即登录
          </Button>
        </motion.div>
      </motion.div>

      {/* 底部装饰 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6, duration: 0.5 }}
        className="mt-16 flex flex-col gap-2 text-center"
      >
        <span className="text-purple-300/50 text-sm">
          Sakura AI. Powered by AI & Automation
        </span>
        <span className="text-purple-300/50 text-sm">
          Copyright © 2019-2025 SakuraTech. All rights reserved.
        </span>
      </motion.div>
    </motion.div>
  );
};