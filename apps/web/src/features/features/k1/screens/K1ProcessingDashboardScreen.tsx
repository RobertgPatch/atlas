import React from 'react';
import {
  K1ProcessingDashboard,
  type K1ProcessingDashboardProps,
} from 'packages/ui';

export type K1ProcessingDashboardScreenProps = K1ProcessingDashboardProps;

export const K1ProcessingDashboardScreen: React.FC<K1ProcessingDashboardScreenProps> = (props) => {
  return <K1ProcessingDashboard {...props} />;
};

export default K1ProcessingDashboardScreen;
