import React, { useState } from 'react';
import { Form, Input, Button, Alert } from 'antd';
import { Mail, Lock, ArrowLeft, Shield } from 'lucide-react';
import { motion } from 'framer-motion';
import { authService } from '../services/authService';

interface ForgotPasswordProps {
  onBackToLogin: () => void;
}

export const ForgotPassword: React.FC<ForgotPasswordProps> = ({ onBackToLogin }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const handleSendCode = async () => {
    const email = form.getFieldValue('email');
    if (!email) {
      setError('请输入邮箱地址');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await authService.sendResetCode(email);
      setCountdown(60);
      const timer = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err: any) {
      setError(err.message || '发送验证码失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (values: { email: string; code: string; password: string; confirmPassword: string }) => {
    if (values.password !== values.confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }
    if (values.password.length < 6) {
      setError('密码长度至少6位');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await authService.resetPassword(values.email, values.code, values.password);
      setSuccess(true);
      setTimeout(() => {
        onBackToLogin();
      }, 2000);
    } catch (err: any) {
      setError(err.message || '重置密码失败');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="w-full max-w-md mx-auto text-center"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-500/20 flex items-center justify-center"
        >
          <span className="text-4xl">✅</span>
        </motion.div>
        <h2 className="text-2xl font-bold text-white mb-2">密码重置成功</h2>
        <p className="text-purple-300/60 mb-4">正在跳转到登录页面...</p>
        <Button type="link" onClick={onBackToLogin} className="text-purple-300">立即返回登录</Button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8 }}
      className="w-full max-w-md mx-auto"
    >
      <motion.div
        className="flex flex-col items-center mb-12 py-4"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.8 }}
      >
        <div className="w-[110px] h-[110px] mb-0 flex items-center justify-center">
          <img src="/logo1.svg" alt="Sakura Logo" className="w-full h-full object-contain" />
        </div>
        <h1 className="text-4xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-purple-300 via-purple-200 to-purple-100 drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]">
          Sakura AI
        </h1>
        <p className="text-sm font-light tracking-[0.15em] bg-clip-text text-transparent bg-gradient-to-r from-purple-300/90 via-purple-200/80 to-purple-100/90 drop-shadow-[0_0_4px_rgba(168,85,247,0.4)]">
          企业级 · 一站式智能自动化平台
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="backdrop-blur-xl bg-white/10 rounded-3xl p-8 shadow-2xl border border-white/20"
      >
        <Button type="link" onClick={onBackToLogin} className="text-purple-300 hover:text-purple-200 p-0 h-auto mb-6 flex items-center" icon={<ArrowLeft className="w-4 h-4" />}>
          返回登录
        </Button>

        <h2 className="text-xl font-semibold text-white mb-2">重置密码</h2>
        <p className="text-purple-300/60 text-sm mb-6">输入邮箱获取验证码，然后设置新密码</p>

        {error && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
            <Alert message={error} type="error" closable onClose={() => setError(null)} className="login-alert rounded-xl" />
          </motion.div>
        )}

        <Form form={form} onFinish={handleSubmit} layout="vertical" requiredMark={false} className="space-y-4">
          <Form.Item name="email" rules={[{ required: true, message: '请输入邮箱' }, { type: 'email', message: '请输入有效的邮箱地址' }]} className="login-input">
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-10">
                <Mail className="w-5 h-5 text-purple-300 group-hover:text-purple-200 transition-colors" />
              </div>
              <Input placeholder="注册邮箱" autoComplete="email" className="h-14 pl-12 pr-4 rounded-xl transition-all" />
            </div>
          </Form.Item>

          <div className="flex gap-3">
            <Form.Item name="code" rules={[{ required: true, message: '请输入验证码' }]} className="login-input flex-1" style={{ marginBottom: 0 }}>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-10">
                  <Shield className="w-5 h-5 text-purple-300 group-hover:text-purple-200 transition-colors" />
                </div>
                <Input placeholder="验证码" maxLength={6} className="h-14 pl-12 pr-4 rounded-xl transition-all" />
              </div>
            </Form.Item>
            <Form.Item className="mb-0" style={{ width: '130px' }}>
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="h-full">
                <Button
                  onClick={handleSendCode}
                  loading={loading}
                  disabled={countdown > 0}
                  block
                  className="h-14 rounded-xl transition-all"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    borderColor: 'transparent',
                    color: countdown > 0 ? 'rgba(196,181,253,0.5)' : 'rgb(196,181,253)',
                    '--ant-button-default-hover-bg': 'rgba(255,255,255,0.1)',
                    '--ant-button-default-active-bg': 'rgba(255,255,255,0.15)',
                    '--ant-button-default-disabled-bg': 'rgba(255,255,255,0.08)',
                    '--ant-button-default-disabled-border-color': 'transparent',
                    '--ant-button-default-disabled-color': 'rgba(196,181,253,0.5)',
                  } as React.CSSProperties}
                  // className="h-14 rounded-xl bg-gradient-to-r from-purple-500/40 to-purple-600/30 border border-purple-400/30 text-purple-200 hover:from-purple-500/60 hover:to-purple-600/50 hover:text-white hover:border-purple-400/50 transition-all backdrop-blur-sm"
                >
                  {countdown > 0 ? `${countdown}s` : '获取验证码'}
                </Button>
              </motion.div>
            </Form.Item>
          </div>

          <Form.Item name="password" rules={[{ required: true, message: '请输入新密码' }, { min: 6, message: '密码长度至少6位' }]} className="login-input">
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-10">
                <Lock className="w-5 h-5 text-purple-300 group-hover:text-purple-200 transition-colors" />
              </div>
              <Input.Password placeholder="新密码" autoComplete="new-password" className="h-14 pl-12 pr-4 rounded-xl transition-all" />
            </div>
          </Form.Item>

          <Form.Item name="confirmPassword" rules={[{ required: true, message: '请确认新密码' }]} className="login-input">
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-10">
                <Lock className="w-5 h-5 text-purple-300 group-hover:text-purple-200 transition-colors" />
              </div>
              <Input.Password placeholder="确认新密码" autoComplete="new-password" className="h-14 pl-12 pr-4 rounded-xl transition-all" />
            </div>
          </Form.Item>

          <Form.Item className="mb-0">
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button type="primary" htmlType="submit" loading={loading} block className="login-button h-14 rounded-xl text-base font-semibold transition-all">
                {loading ? '重置中...' : '确认重置'}
              </Button>
            </motion.div>
          </Form.Item>
        </Form>
      </motion.div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6, duration: 0.5 }} className="mt-16 flex flex-col gap-2 text-center">
        <span className="text-purple-300/50 text-sm">Sakura AI. Powered by AI & Automation</span>
        <span className="text-purple-300/50 text-sm">Copyright © 2019-2025 SakuraTech. All rights reserved.</span>
      </motion.div>
    </motion.div>
  );
};