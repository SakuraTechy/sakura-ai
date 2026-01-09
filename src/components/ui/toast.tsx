"use client"

import * as React from "react"
import { 
  CheckCircle, 
  AlertCircle, 
  Info, 
  X
} from "lucide-react"
import { clsx } from "../../utils/clsx"
import { 
  AlertCircle as AlertCircleIcon,
  CheckCircle as CheckCircleIcon,
  XCircle as XCircleIcon,
  Info as InfoIcon
} from "lucide-react"

export interface Toast {
  id: string
  title: string
  description?: string
  action?: React.ReactNode
  type?: "default" | "success" | "error" | "info" | "warning"
  duration?: number
}

interface ToastContextValue {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, "id">) => void
  removeToast: (id: string) => void
  removeAllToasts: () => void
}

const ToastContext = React.createContext<ToastContextValue>({
  toasts: [],
  addToast: () => null,
  removeToast: () => null,
  removeAllToasts: () => null,
})

export const useToast = () => {
  const context = React.useContext(ToastContext)
  
  if (context === undefined) {
    throw new Error("useToast must be used within a ToastProvider")
  }
  
  return context
}

interface ToastProviderProps {
  children: React.ReactNode
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = React.useState<Toast[]>([])

  const addToast = React.useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = Math.random().toString(36).substring(2, 9)
      
      setToasts((prev) => [...prev, { id, ...toast }])
      
      if (toast.duration !== Infinity) {
        setTimeout(() => {
          removeToast(id)
        }, toast.duration || 5000)
      }
    },
    []
  )

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const removeAllToasts = React.useCallback(() => {
    setToasts([])
  }, [])

  const value = React.useMemo(
    () => ({
      toasts,
      addToast,
      removeToast,
      removeAllToasts,
    }),
    [toasts, addToast, removeToast, removeAllToasts]
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  )
}

function ToastContainer() {
  const { toasts, removeToast } = useToast()
  
  return (
    <div className="fixed top-0 right-0 z-50 flex flex-col gap-2 p-4 max-h-screen overflow-hidden">
    {/* <div className="fixed top-20 right-4 z-[9999] flex flex-col gap-2 max-h-[calc(100vh-6rem)] overflow-hidden"> */}
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </div>
  )
}

interface ToastItemProps {
  toast: Toast
  onClose: () => void
}

function ToastItem({ toast, onClose }: ToastItemProps) {
  const { title, description, type = "default", action } = toast
  
  const icons = {
    default: null,
    success: <CheckCircleIcon className="h-5 w-5 text-green-500" />,
    error: <XCircleIcon className="h-5 w-5 text-red-500" />,
    warning: <AlertCircleIcon className="h-5 w-5 text-amber-500" />,
    info: <InfoIcon className="h-5 w-5 text-blue-500" />,
  }
  
  const bgColors = {
    default: "bg-white",
    success: "bg-white border-l-4 border-green-500",
    error: "bg-white border-l-4 border-red-500",
    warning: "bg-white border-l-4 border-amber-500",
    info: "bg-white border-l-4 border-blue-500",
  }
  
  return (
    <div
      className={clsx(
        "w-80 rounded-lg shadow-lg p-4 flex gap-3 relative animate-slide-in-from-top",
        bgColors[type]
      )}
    >
      {icons[type] && (
        <div className="flex-shrink-0 mt-0.5">
          {icons[type]}
        </div>
      )}
      
      <div className="flex-1 mr-5 min-w-0">
        <h3 className="font-medium text-gray-900 break-words">{title}</h3>
        {description && (
          <p className="text-sm text-gray-600 mt-1 break-words">{description}</p>
        )}
        {action && <div className="mt-2">{action}</div>}
      </div>
      
      <button
        onClick={onClose}
        className="absolute top-2 right-2 text-gray-500 hover:text-gray-900"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
} 