import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { AlertTriangle, Coins, Hash } from 'lucide-react'
import {
  TIME_RANGES,
  type LeaderboardMetric,
  type TimeRange,
  formatCost,
  formatInteger,
  formatTokenCount,
  getLeaderboard,
} from '@/lib/telemetry-api'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'

function LeaderboardRoute() {
  const [range, setRange] = useState<TimeRange>('7d')
  const [metric, setMetric] = useState<LeaderboardMetric>('cost')
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['leaderboard', range, metric],
    queryFn: () => getLeaderboard(range, metric),
  })

  const rows = data?.rows ?? []

  return (
    <>
      <Header>
        <div className='text-sm font-medium'>排行榜</div>
        <div className='ms-auto flex items-center space-x-4'>
          <ThemeSwitch />
          <ProfileDropdown />
        </div>
      </Header>
      <Main>
        <div className='mb-4 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>排行榜</h1>
            <p className='text-sm text-muted-foreground'>
              按费用或 Token 查看用户聚合排名。
            </p>
          </div>
          <div className='flex flex-col gap-2 sm:flex-row'>
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
            <Tabs
              value={metric}
              onValueChange={(value) => setMetric(value as LeaderboardMetric)}
            >
              <TabsList>
                <TabsTrigger value='cost'>
                  <Coins className='size-4' />
                  费用
                </TabsTrigger>
                <TabsTrigger value='tokens'>
                  <Hash className='size-4' />
                  Token
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {isError && (
          <Alert variant='destructive' className='mb-4'>
            <AlertTriangle className='size-4' />
            <AlertTitle>排行榜加载失败</AlertTitle>
            <AlertDescription>
              {error instanceof Error ? error.message : '无法读取排行榜数据。'}
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>
              {metric === 'cost' ? '费用排行' : 'Token 排行'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className='w-16'>排名</TableHead>
                  <TableHead>用户</TableHead>
                  <TableHead className='text-end'>主指标</TableHead>
                  <TableHead className='text-end'>总费用</TableHead>
                  <TableHead className='text-end'>总 Token</TableHead>
                  <TableHead className='text-end'>Sessions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.user_id}>
                    <TableCell className='font-medium'>{row.rank}</TableCell>
                    <TableCell>
                      <div className='font-medium'>{row.name || row.email}</div>
                      <div className='text-xs text-muted-foreground'>
                        {row.email}
                      </div>
                    </TableCell>
                    <TableCell className='text-end font-medium'>
                      {metric === 'cost'
                        ? formatCost(row.total_cost)
                        : formatTokenCount(row.total_tokens)}
                    </TableCell>
                    <TableCell className='text-end'>
                      {formatCost(row.total_cost)}
                    </TableCell>
                    <TableCell className='text-end'>
                      {formatTokenCount(row.total_tokens)}
                    </TableCell>
                    <TableCell className='text-end'>
                      {formatInteger(row.session_count)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!isLoading && rows.length === 0 && (
              <p className='mt-4 text-sm text-muted-foreground'>
                当前时间范围暂无排行数据。
              </p>
            )}
            {isLoading && (
              <p className='mt-4 text-sm text-muted-foreground'>
                正在加载排行榜...
              </p>
            )}
          </CardContent>
        </Card>
      </Main>
    </>
  )
}

export const Route = createFileRoute('/_authenticated/leaderboard')({
  component: LeaderboardRoute,
})
