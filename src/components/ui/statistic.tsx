import * as React from "react"
import { cn } from "@/lib/utils"

interface StatisticProps extends React.HTMLAttributes<HTMLDivElement> {
  title: React.ReactNode;
  value: React.ReactNode;
}

function Statistic({ className, title, value, ...props }: StatisticProps) {
  return (
    <div className={cn("space-y-1", className)} {...props}>
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="text-lg font-semibold text-foreground leading-none">{value}</p>
    </div>
  )
}

export { Statistic }
