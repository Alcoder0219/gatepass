import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LogOut, Menu, Moon, Plus, Settings, Sun, User as UserIcon, Wifi, WifiOff } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useSocket } from '@/contexts/SocketContext';
import { usePermissions } from '@/permissions/usePermissions';
import { PERMISSION } from '@/permissions/constants';
import { Avatar, Button, Dropdown, Tooltip } from '@/components/ui';
import { GlobalSearch } from '@/components/common/GlobalSearch';
import { NotificationBell } from '@/components/common/NotificationBell';

export const Topbar = ({ onOpenMobileMenu }: { onOpenMobileMenu: () => void }) => {
  const { user, logout } = useAuth();
  const { resolved, toggle } = useTheme();
  const { isConnected } = useSocket();
  const { can } = usePermissions();
  const navigate = useNavigate();

  return (
    <header className="glass sticky top-0 z-20 flex h-16 items-center gap-3 rounded-none border-x-0 border-t-0 px-4 sm:gap-4 sm:px-6">
      <Button
        variant="ghost"
        size="icon"
        onClick={onOpenMobileMenu}
        className="lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="hidden flex-1 sm:block">
        <GlobalSearch />
      </div>
      <div className="flex-1 sm:hidden" />

      <div className="flex items-center gap-1 sm:gap-2">
        {can(PERMISSION.GATEPASS_CREATE) && (
          <Button
            size="sm"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => navigate('/gate-pass/new')}
            className="hidden sm:inline-flex"
          >
            New Pass
          </Button>
        )}

        {/* Live socket indicator — real-time features silently degrading is worse
            than telling the user the connection dropped. */}
        <Tooltip content={isConnected ? 'Live updates connected' : 'Reconnecting…'}>
          <span
            className={`hidden h-9 w-9 items-center justify-center rounded-xl sm:flex ${
              isConnected ? 'text-success-500' : 'text-content-subtle'
            }`}
          >
            {isConnected ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
          </span>
        </Tooltip>

        <Tooltip content={resolved === 'dark' ? 'Switch to light' : 'Switch to dark'}>
          <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
            <motion.span
              key={resolved}
              initial={{ rotate: -90, opacity: 0, scale: 0.7 }}
              animate={{ rotate: 0, opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="flex"
            >
              {resolved === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </motion.span>
          </Button>
        </Tooltip>

        <NotificationBell />

        <Dropdown
          align="right"
          trigger={
            <button
              type="button"
              className="flex items-center gap-2 rounded-xl p-1 transition-colors hover:bg-content/5"
              aria-label="Account menu"
            >
              <Avatar src={user?.profileImage} name={user?.name} size="sm" />
              <div className="hidden pr-1 text-left lg:block">
                <p className="max-w-[140px] truncate text-sm font-semibold leading-tight text-content">
                  {user?.name}
                </p>
                <p className="text-xs leading-tight text-content-muted">{user?.role?.name}</p>
              </div>
            </button>
          }
          items={[
            {
              label: 'My Profile',
              icon: <UserIcon className="h-4 w-4" />,
              onClick: () => navigate('/profile'),
            },
            ...(can(PERMISSION.SETTINGS_VIEW)
              ? [
                  {
                    label: 'Settings',
                    icon: <Settings className="h-4 w-4" />,
                    onClick: () => navigate('/settings'),
                  },
                ]
              : []),
            {
              label: 'Sign out',
              icon: <LogOut className="h-4 w-4" />,
              danger: true,
              separated: true,
              onClick: () => void logout(),
            },
          ]}
        />
      </div>
    </header>
  );
};

export default Topbar;
