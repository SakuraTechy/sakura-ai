import * as React from "react"
import { clsx } from "../../utils/clsx"
import { motion } from "framer-motion"
import { Loader2 } from "lucide-react"

const buttonVariants = {
  variant: {
    default: "bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg hover:shadow-xl hover:from-blue-600 hover:to-purple-700 focus-visible:ring-blue-500",
    destructive: "bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg hover:shadow-xl hover:from-red-600 hover:to-red-700 focus-visible:ring-red-500",
    outline: "border-2 border-gray-300 text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-400 dark:border-gray-600 dark:text-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 focus-visible:ring-blue-500",
    secondary: "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 focus-visible:ring-gray-400",
    ghost: "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-100 focus-visible:ring-transparent",
    link: "text-blue-600 underline-offset-4 hover:underline dark:text-blue-400 focus-visible:ring-blue-500"
  },
  size: {
    default: "h-11 px-6 py-3 text-base",
    sm: "h-9 px-4 py-2 text-sm",
    lg: "h-13 px-8 py-4 text-lg",
    icon: "h-11 w-11",
    "icon-sm": "h-8 w-8",
    "icon-xs": "h-7 w-7",
  },
  disabled: "opacity-50 cursor-not-allowed"
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof buttonVariants.variant
  size?: keyof typeof buttonVariants.size
  isLoading?: boolean
  icon?: React.ReactNode
  iconPosition?: "left" | "right"
  fullWidth?: boolean
  gradient?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ 
    className, 
    variant = "default", 
    size = "default", 
    isLoading = false,
    disabled = false,
    icon,
    iconPosition = "left", 
    fullWidth = false,
    gradient = false,
    children, 
    onClick,
    ...props 
  }, ref) => {
    const isDisabled = isLoading || disabled;
    const isIconButton = size === "icon" || size === "icon-sm" || size === "icon-xs";
    const isGhostVariant = variant === "ghost";
    
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!isDisabled && onClick) {
        onClick(e);
      }
    };

    // 图标按钮和 ghost 变体使用更轻微的动画
    const hoverAnimation = !isDisabled 
      ? (isIconButton || isGhostVariant) 
        ? {} // 图标按钮不使用缩放动画，避免变大
        : { scale: 1.02, y: -1 }
      : {};
    
    const tapAnimation = !isDisabled 
      ? (isIconButton || isGhostVariant)
        ? { scale: 0.95 } // 图标按钮使用轻微的缩小效果
        : { scale: 0.98 }
      : {};
    
    return (
      <motion.button
        className={clsx(
          "inline-flex items-center justify-center font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 gap-2",
          // 非图标按钮使用圆角
          isIconButton ? "rounded-lg" : "rounded-xl",
          // 非图标按钮使用 active:scale-95
          !isIconButton && "active:scale-95",
          buttonVariants.variant[variant],
          buttonVariants.size[size],
          {
            "w-full": fullWidth,
            "opacity-50 cursor-not-allowed": isDisabled,
          },
          className
        )}
        ref={ref}
        disabled={isDisabled}
        onClick={handleClick}
        whileHover={hoverAnimation}
        whileTap={tapAnimation}
        transition={{ duration: 0.1 }}
        {...props}
      >
        {isLoading && (
          <Loader2 className="animate-spin" size={size === "sm" ? 16 : size === "lg" ? 20 : 18} />
        )}
        
        {!isLoading && icon && iconPosition === "left" && (
          <span className="flex-shrink-0">{icon}</span>
        )}
        
        {children && (
          <span className={clsx({ "sr-only": isLoading && !children })}>
            {children}
          </span>
        )}
        
        {!isLoading && icon && iconPosition === "right" && (
          <span className="flex-shrink-0">{icon}</span>
        )}
      </motion.button>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants } 