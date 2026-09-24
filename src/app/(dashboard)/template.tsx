// Templates remount on navigation, so each page eases in while the shell stays put.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
