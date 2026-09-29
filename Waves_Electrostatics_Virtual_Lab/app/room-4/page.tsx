import type { Metadata } from 'next';
import AstroExperience from '../AstroExperience';

export const metadata: Metadata = {
  title: 'Room 04 — UPHSD Astronomical Society (In Development)',
  description: 'Extracurricular student-organization discovery center and virtual observatory for the proposed UPHSD Astronomical Society.',
};

export default function RoomFour() {
  return <AstroExperience />;
}
