import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Data storage directory inside the project
const DATA_DIR = path.join(process.cwd(), '.data');
const SURVEYS_FILE = path.join(DATA_DIR, 'astro_surveys_aggregate.json');
const CONTACTS_FILE = path.join(DATA_DIR, 'astro_contacts_optional.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function appendRecord(filePath: string, record: unknown) {
  ensureDataDir();
  let list: unknown[] = [];
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      list = JSON.parse(content);
      if (!Array.isArray(list)) list = [];
    } catch {
      list = [];
    }
  }
  list.push(record);
  fs.writeFileSync(filePath, JSON.stringify(list, null, 2), 'utf-8');
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      type?: string;
      data?: {
        q1_spaceInterest?: string;
        q2_joinInterest?: string;
        q3_activities?: string[];
        q4_mostExcitedActivity?: string;
        q5_frequency?: string;
        q6_contributions?: string[];
        q7_desiredEvents?: string;
        q8_committeeInterest?: string;
        q9_receiveUpdates?: string;
        q10_generalFeedback?: string;
        visitedCount?: number;
        contactName?: string;
        contactEmail?: string;
        contactProgramYear?: string;
      };
    };
    const timestamp = new Date().toISOString();

    if (body.type === 'survey_submission') {
      // Clean separation: Store ONLY the anonymous survey responses
      const anonymousSurvey = {
        id: `survey_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        timestamp,
        q1_spaceInterest: body.data?.q1_spaceInterest || '',
        q2_joinInterest: body.data?.q2_joinInterest || '',
        q3_activities: body.data?.q3_activities || [],
        q4_mostExcitedActivity: body.data?.q4_mostExcitedActivity || '',
        q5_frequency: body.data?.q5_frequency || '',
        q6_contributions: body.data?.q6_contributions || [],
        q7_desiredEvents: body.data?.q7_desiredEvents || '',
        q8_committeeInterest: body.data?.q8_committeeInterest || '',
        q9_receiveUpdates: body.data?.q9_receiveUpdates || '',
        q10_generalFeedback: body.data?.q10_generalFeedback || '',
        visitedCount: body.data?.visitedCount || 0,
      };

      appendRecord(SURVEYS_FILE, anonymousSurvey);
      return NextResponse.json({ success: true, message: 'Survey response recorded anonymously.' });
    }

    if (body.type === 'contact_submission') {
      // Stored in a separate contact registry for committee outreach
      const optionalContact = {
        id: `contact_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        timestamp,
        name: body.data?.contactName || '',
        email: body.data?.contactEmail || '',
        programYear: body.data?.contactProgramYear || '',
      };

      appendRecord(CONTACTS_FILE, optionalContact);
      return NextResponse.json({ success: true, message: 'Optional contact details saved separately.' });
    }

    return NextResponse.json({ error: 'Invalid submission type' }, { status: 400 });
  } catch (err) {
    console.error('Error saving survey data:', err);
    return NextResponse.json({ error: 'Internal storage error' }, { status: 500 });
  }
}

export async function GET() {
  // Aggregate stats endpoint for student organizing committee
  ensureDataDir();
  let surveyCount = 0;
  let contactCount = 0;

  if (fs.existsSync(SURVEYS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(SURVEYS_FILE, 'utf-8'));
      if (Array.isArray(data)) surveyCount = data.length;
    } catch {}
  }

  if (fs.existsSync(CONTACTS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(CONTACTS_FILE, 'utf-8'));
      if (Array.isArray(data)) contactCount = data.length;
    } catch {}
  }

  return NextResponse.json({
    status: 'online',
    organization: 'UPHSD Astronomical Society (In Development)',
    totalSurveysCollected: surveyCount,
    totalOptionalContactsCollected: contactCount,
  });
}
