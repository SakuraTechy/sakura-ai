import { motion } from 'framer-motion';
import { Brain, CheckCircle, Loader2 } from 'lucide-react';

interface ProgressItem {
  label: string;
  status: 'completed' | 'processing' | 'pending';
}

interface AIThinkingProps {
  title?: string;
  subtitle?: string;
  progressItems?: ProgressItem[];
}

export function AIThinking({
  title = 'AI 正在分析原型结构...',
  subtitle = '预计需要 30-60 秒',
  progressItems = []
}: AIThinkingProps) {
  return (
    <div className="flex flex-col items-center justify-center mb-10">
      {/* 主动画区 */}
      <div className="relative w-32 h-32 mb-8">
        {/* 背景光晕 */}
        <motion.div
          className="absolute inset-0 rounded-full bg-gradient-to-br from-purple-500 to-blue-500
                     opacity-20 blur-2xl"
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.2, 0.4, 0.2]
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />

        {/* 跳动的点 */}
        <div className="absolute inset-0 flex items-center justify-center gap-3">
          {[0, 1, 2].map((index) => (
            <motion.div
              key={index}
              className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 to-blue-500
                         shadow-lg"
              animate={{
                y: [0, -15, 0],
                scale: [1, 1.2, 1]
              }}
              transition={{
                duration: 1,
                repeat: Infinity,
                delay: index * 0.2,
                ease: "easeInOut"
              }}
            />
          ))}
        </div>

        {/* 中心图标 */}
        <div className="absolute inset-0 flex items-center justify-center">
          <Brain className="w-14 h-14 text-purple-600" />
        </div>
      </div>

      {/* 文字提示 */}
      <motion.div
        className="text-center"
        animate={{ opacity: [1, 0.6, 1] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <p className="text-xl font-semibold text-gray-900 mb-2">
          {title}
        </p>
        <p className="text-sm text-gray-500">
          {subtitle}
        </p>
      </motion.div>

      {/* 进度列表 */}
      {progressItems.length > 0 && (
        <div className="mt-8 space-y-3">
          {progressItems.map((item, index) => (
            <motion.div
              key={`${item.label}-${index}`}
              className="flex items-center gap-3 text-sm"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.2 }}
            >
              {item.status === 'completed' && (
                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
              )}
              {item.status === 'processing' && (
                <Loader2 className="w-5 h-5 animate-spin text-blue-500 flex-shrink-0" />
              )}
              {item.status === 'pending' && (
                <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0" />
              )}
              <span className={item.status === 'completed' ? 'text-gray-700' : 'text-gray-500'}>
                {item.label}
              </span>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
