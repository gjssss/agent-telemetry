import { BarChart3, Info, UserCircle } from 'lucide-react'
import { type SidebarData } from '../types'

export const sidebarData: SidebarData = {
  user: {
    name: 'Agent Telemetry',
    email: '',
    avatar: '',
  },
  teams: [],
  navGroups: [
    {
      title: 'Agent Telemetry',
      items: [
        {
          title: '信息页',
          url: '/',
          icon: Info,
        },
        {
          title: '排行榜',
          url: '/leaderboard',
          icon: BarChart3,
        },
        {
          title: '个人页',
          url: '/profile',
          icon: UserCircle,
        },
      ],
    },
  ],
}
