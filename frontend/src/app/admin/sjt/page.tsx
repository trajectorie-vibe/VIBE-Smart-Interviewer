import { redirect } from 'next/navigation';

export default function Page() {
  // Deprecated: route removed. Redirect to main Admin dashboard.
  redirect('/admin');
}

