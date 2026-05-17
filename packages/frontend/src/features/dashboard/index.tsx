import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  AlertTriangle,
  Bot,
  Brain,
  Coins,
  MessageSquare,
  MousePointerClick,
  Users,
} from 'lucide-react'
import {
  TIME_RANGES,
  type TimeRange,
  formatCost,
  formatInteger,
  getSummary,
} from '@/lib/telemetry-api'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'

function MetricCard({
  title,
  value,
  detail,
  icon: Icon,
}: {
  title: string
  value: string
  detail: string
  icon: React.ElementType
}) {
  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
        <CardTitle className='text-sm font-medium'>{title}</CardTitle>
        <Icon className='size-4 text-muted-foreground' />
      </CardHeader>
      <CardContent>
        <div className='text-2xl font-bold'>{value}</div>
        <p className='mt-1 text-xs text-muted-foreground'>{detail}</p>
      </CardContent>
    </Card>
  )
}

export function Dashboard() {
  const [range, setRange] = useState<TimeRange>('7d')
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['summary', range],
    queryFn: () => getSummary(range),
  })

  const totals = data?.totals
  const models = data?.models ?? []
  const providers = data?.providers ?? []
  const missingModels = data?.missing_price_model_ids ?? []

  return (
    <>
      <Header>
        <div className='text-sm font-medium'>信息页</div>
        <div className='ms-auto flex items-center space-x-4'>
          <ThemeSwitch />
          <ProfileDropdown />
        </div>
      </Header>

      <Main>
        <div className='mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>信息页</h1>
            <p className='text-sm text-muted-foreground'>
              查看 Codex session 上传后的费用、Token、模型和行为聚合。
            </p>
          </div>
          <Tabs
            value={range}
            onValueChange={(value) => setRange(value as TimeRange)}
          >
            <TabsList>
              {TIME_RANGES.map((item) => (
                <TabsTrigger key={item.value} value={item.value}>
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {missingModels.length > 0 && (
          <Alert className='mb-4 border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100'>
            <AlertTriangle className='size-4' />
            <AlertTitle>模型价格缺失</AlertTitle>
            <AlertDescription>
              管理员需要在 models.json 补充价格：
              <span className='font-medium'>{missingModels.join(', ')}</span>
            </AlertDescription>
          </Alert>
        )}

        {isError && (
          <Alert variant='destructive' className='mb-4'>
            <AlertTriangle className='size-4' />
            <AlertTitle>统计数据加载失败</AlertTitle>
            <AlertDescription>
              {error instanceof Error ? error.message : '无法读取信息页数据。'}
            </AlertDescription>
          </Alert>
        )}

        <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
          <MetricCard
            title='总费用'
            value={formatCost(totals?.total_cost)}
            detail={`${formatInteger(totals?.session_count)} 个 session`}
            icon={Coins}
          />
          <MetricCard
            title='总 Token'
            value={formatInteger(totals?.total_tokens)}
            detail={`输入 ${formatInteger(totals?.input_tokens)} / 输出 ${formatInteger(totals?.output_tokens)}`}
            icon={Brain}
          />
          <MetricCard
            title='Agent'
            value={formatInteger(totals?.user_count)}
            detail={`${providers.length} 个 provider`}
            icon={Bot}
          />
          <MetricCard
            title='模型'
            value={formatInteger(totals?.model_count)}
            detail={`${missingModels.length} 个模型缺少价格`}
            icon={Activity}
          />
        </div>

        <div className='mt-4 grid gap-4 lg:grid-cols-2'>
          <Card>
            <CardHeader>
              <CardTitle>行为计数</CardTitle>
            </CardHeader>
            <CardContent className='grid gap-3 sm:grid-cols-2'>
              {[
                {
                  title: 'API 调用',
                  value: formatInteger(totals?.api_call_count),
                  detail: '解析到的模型请求次数',
                  icon: MousePointerClick,
                },
                {
                  title: '对话轮次',
                  value: formatInteger(totals?.conversation_turn_count),
                  detail: '唯一 turn_context 计数',
                  icon: MessageSquare,
                },
                {
                  title: '用户消息',
                  value: formatInteger(totals?.user_message_count),
                  detail: 'event_msg 用户消息数',
                  icon: Users,
                },
                {
                  title: '工具调用',
                  value: formatInteger(totals?.tool_call_count),
                  detail: '仅统计调用次数',
                  icon: Bot,
                },
              ].map((item) => {
                const Icon = item.icon
                return (
                  <div
                    key={item.title}
                    className='rounded-md border bg-muted/20 p-3'
                  >
                    <div className='flex items-center justify-between gap-2'>
                      <div className='text-sm font-medium'>{item.title}</div>
                      <Icon className='size-4 text-muted-foreground' />
                    </div>
                    <div className='mt-2 text-2xl font-bold'>{item.value}</div>
                    <div className='mt-1 text-xs text-muted-foreground'>
                      {item.detail}
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>模型分布</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className='text-sm text-muted-foreground'>
                  正在加载模型数据...
                </p>
              ) : models.length === 0 ? (
                <p className='text-sm text-muted-foreground'>
                  当前时间范围暂无模型数据。
                </p>
              ) : (
                <div className='space-y-3'>
                  {models.map((model) => (
                    <div
                      key={`${model.model}-${model.model_provider ?? 'unknown'}`}
                      className='flex items-center justify-between gap-3 border-b pb-3 last:border-0 last:pb-0'
                    >
                      <div className='min-w-0'>
                        <div className='truncate text-sm font-medium'>
                          {model.model}
                        </div>
                        <div className='text-xs text-muted-foreground'>
                          {model.model_provider ?? 'unknown'} ·{' '}
                          {formatInteger(model.session_count)} sessions
                        </div>
                      </div>
                      <div className='text-end text-sm'>
                        <div className='font-medium'>
                          {formatCost(model.total_cost)}
                        </div>
                        <div className='text-xs text-muted-foreground'>
                          {formatInteger(model.total_tokens)} tokens
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </Main>
    </>
  )
}
