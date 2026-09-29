'use client';

export type AstroActivityId =
  | 'society_information'
  | 'solar_system'
  | 'virtual_observatory'
  | 'activities'
  | 'astrophotography'
  | 'research'
  | 'constellations'
  | 'space_missions'
  | 'membership_survey';

export const TOTAL_EXPLORATION_STATIONS = 8;

export type ExplorationState = {
  visitedStations: string[];
  surveySubmitted: boolean;
};

export const ASTRO_STORAGE_KEY = 'uphsd_astro_society_exploration_v1';
export const ASTRO_SURVEY_KEY = 'uphsd_astro_society_survey_response_v1';

// --- Constellations Data ---
export type Constellation = {
  id: string;
  name: string;
  pronunciation: string;
  englishName: string;
  coordinates: { ra: string; dec: string };
  bestSeason: string;
  brightestStars: Array<{ name: string; designation: string; mag: string; dist: string }>;
  deepSkyObjects: Array<{ name: string; type: string; desc: string }>;
  mythology: string;
  significance: string;
};

export const CONSTELLATIONS: Constellation[] = [
  {
    id: 'orion',
    name: 'Orion',
    pronunciation: 'oh-RY-un',
    englishName: 'The Hunter',
    coordinates: { ra: '05h 35m', dec: '+09° 56′' },
    bestSeason: 'Northern Winter (December – February)',
    brightestStars: [
      { name: 'Betelgeuse', designation: 'Alpha Orionis', mag: '0.42 (var)', dist: '640 light-years (red supergiant)' },
      { name: 'Rigel', designation: 'Beta Orionis', mag: '0.18', dist: '860 light-years (blue-white supergiant)' },
      { name: 'Bellatrix', designation: 'Gamma Orionis', mag: '1.64', dist: '250 light-years' },
      { name: "Orion's Belt", designation: 'Alnitak, Alnilam, Mintaka', mag: '1.7 – 2.2', dist: '1,200 light-years' },
    ],
    deepSkyObjects: [
      { name: 'Great Orion Nebula (M42 / NGC 1976)', type: 'Diffuse Emission Nebula', desc: 'Stellar nursery 1,344 light-years away, visible to the naked eye as a fuzzy patch in Orion’s sword.' },
      { name: 'Horsehead Nebula (Barnard 33)', type: 'Dark Nebula', desc: 'Silhouette of dust against the bright ionized hydrogen emission nebula IC 434.' },
    ],
    mythology: 'In Greek mythology, Orion was a gigantic, skilled hunter who boasted he could defeat any beast on Earth. The Earth goddess Gaia dispatched a giant scorpion to challenge him, which is why Orion and Scorpius occupy opposite halves of the sky.',
    significance: 'Perhaps the most recognizable constellation in the night sky. Its celestial equator location makes it visible from both northern and southern hemispheres.',
  },
  {
    id: 'ursa_major',
    name: 'Ursa Major',
    pronunciation: 'UR-suh MAY-jer',
    englishName: 'The Great Bear (The Big Dipper / Plough)',
    coordinates: { ra: '11h 20m', dec: '+50° 40′' },
    bestSeason: 'Circumpolar (Visible year-round from mid-northern latitudes; best in Spring)',
    brightestStars: [
      { name: 'Alioth', designation: 'Epsilon Ursae Majoris', mag: '1.76', dist: '81 light-years' },
      { name: 'Dubhe', designation: 'Alpha Ursae Majoris', mag: '1.79', dist: '123 light-years' },
      { name: 'Merak', designation: 'Beta Ursae Majoris', mag: '2.37', dist: '79 light-years' },
      { name: 'Mizar & Alcor', designation: 'Zeta & 80 UMa', mag: '2.23 / 3.99', dist: '83 light-years (historic naked-eye double)' },
    ],
    deepSkyObjects: [
      { name: "Bode's Galaxy & Cigar Galaxy (M81 & M82)", type: 'Spiral & Starburst Galaxy Pair', desc: 'Majestic galaxy pair approximately 12 million light-years away, interacting gravitationally.' },
      { name: 'Pinwheel Galaxy (M101)', type: 'Face-on Grand Design Spiral', desc: 'Contains over a trillion stars, spanning 170,000 light-years across.' },
    ],
    mythology: 'Representing Callisto, a nymph transformed into a bear by the jealous goddess Hera. Zeus placed her in the stars to protect her from hunters.',
    significance: 'Dubhe and Merak serve as the "Pointer Stars" — drawing an imaginary line upward through them points directly to Polaris (the North Star).',
  },
  {
    id: 'cassiopeia',
    name: 'Cassiopeia',
    pronunciation: 'kass-ee-oh-PEE-uh',
    englishName: 'The Queen',
    coordinates: { ra: '01h 00m', dec: '+60° 00′' },
    bestSeason: 'Circumpolar (Best in Autumn / Northern Winter)',
    brightestStars: [
      { name: 'Schedar', designation: 'Alpha Cassiopeiae', mag: '2.24', dist: '228 light-years' },
      { name: 'Caph', designation: 'Beta Cassiopeiae', mag: '2.28', dist: '54 light-years' },
      { name: 'Navi (Gamma Cas)', designation: 'Gamma Cassiopeiae', mag: '2.15 (variable shell star)', dist: '550 light-years' },
    ],
    deepSkyObjects: [
      { name: 'Heart Nebula & Soul Nebula (IC 1805 & IC 1848)', type: 'Star-forming Complex', desc: 'Glowing clouds of ionized gas and dust 7,500 light-years away.' },
      { name: 'Cassiopeia A', type: 'Supernova Remnant', desc: 'The brightest radio source in the sky outside our Solar System, remnant of an explosion from ~1680.' },
    ],
    mythology: 'The vain queen of Ethiopia in Greek lore who boasted her daughter Andromeda was more beautiful than the Nereids. Poseidon bound her to a celestial chair that revolves upside down half the night as punishment.',
    significance: 'Forms a distinct "W" or "M" pattern easily spotted opposite Ursa Major relative to Polaris.',
  },
  {
    id: 'scorpius',
    name: 'Scorpius',
    pronunciation: 'SKOR-pee-us',
    englishName: 'The Scorpion',
    coordinates: { ra: '16h 53m', dec: '-30° 44′' },
    bestSeason: 'Northern Summer (June – August)',
    brightestStars: [
      { name: 'Antares', designation: 'Alpha Scorpii', mag: '1.06 (var)', dist: '550 light-years (red supergiant "Rival of Mars")' },
      { name: 'Shaula', designation: 'Lambda Scorpii', mag: '1.62', dist: '570 light-years ("The Stinger")' },
      { name: 'Sargas', designation: 'Theta Scorpii', mag: '1.86', dist: '300 light-years' },
    ],
    deepSkyObjects: [
      { name: 'Messier 4 (M4)', type: 'Globular Cluster', desc: 'One of the closest globular clusters to Earth (~7,200 light-years), easily seen in binoculars.' },
      { name: "Ptolemy's Cluster (M7)", type: 'Open Star Cluster', desc: 'Spectacular bright cluster recorded by astronomer Claudius Ptolemy in 130 AD.' },
    ],
    mythology: 'The celestial scorpion sent by Gaia to subdue Orion. When Scorpius rises in the east, Orion sets in the west, forever fleeing.',
    significance: 'Situated directly toward the galactic center of the Milky Way, rich with star fields, dark nebulae, and stellar birth zones.',
  },
  {
    id: 'cygnus',
    name: 'Cygnus',
    pronunciation: 'SIG-nus',
    englishName: 'The Swan (The Northern Cross)',
    coordinates: { ra: '20h 35m', dec: '+42° 00′' },
    bestSeason: 'Northern Summer and Autumn (July – October)',
    brightestStars: [
      { name: 'Deneb', designation: 'Alpha Cygni', mag: '1.25', dist: '2,600 light-years (luminous blue-white supergiant)' },
      { name: 'Albireo', designation: 'Beta Cygni', mag: '3.08', dist: '430 light-years (spectacular gold & blue double star)' },
      { name: 'Sadr', designation: 'Gamma Cygni', mag: '2.23', dist: '1,800 light-years' },
    ],
    deepSkyObjects: [
      { name: 'Veil Nebula (NGC 6960/6992)', type: 'Supernova Remnant', desc: 'Expanding shell of a massive star that exploded ~10,000–20,000 years ago.' },
      { name: 'North America Nebula (NGC 7000)', type: 'Emission Nebula', desc: 'Huge hydrogen cloud shaped remarkably like the continent of North America.' },
    ],
    mythology: 'Associated with Orpheus transformed into a swan upon his death, placed near his beloved lyre (Lyra) in the heavens.',
    significance: 'Deneb forms a vertex of the famed "Summer Triangle" alongside Vega and Altair, soaring along the star-dense Milky Way Great Rift.',
  },
  {
    id: 'taurus',
    name: 'Taurus',
    pronunciation: 'TAW-rus',
    englishName: 'The Bull',
    coordinates: { ra: '04h 42m', dec: '+16° 30′' },
    bestSeason: 'Northern Winter (November – February)',
    brightestStars: [
      { name: 'Aldebaran', designation: 'Alpha Tauri', mag: '0.85', dist: '65 light-years (orange giant "Eye of the Bull")' },
      { name: 'Elnath', designation: 'Beta Tauri', mag: '1.65', dist: '134 light-years' },
      { name: 'Alcyone', designation: 'Eta Tauri (Pleiades)', mag: '2.87', dist: '440 light-years' },
    ],
    deepSkyObjects: [
      { name: 'The Pleiades (Seven Sisters / M45)', type: 'Open Star Cluster', desc: 'Breathtaking blue reflection cluster visible to the naked eye, dominated by hot young stars.' },
      { name: 'Crab Nebula (M1 / NGC 1952)', type: 'Supernova Remnant', desc: 'Debris from the supernova witnessed by Chinese and Arab astronomers in 1054 AD, harboring a central pulsar.' },
    ],
    mythology: 'Representing the white bull form assumed by Zeus in Greek mythology, or the Bull of Heaven fought by Gilgamesh in Babylonian epics.',
    significance: 'Anchor of the winter sky, containing the nearest open clusters to our Solar System (the Hyades and Pleiades).',
  },
];

// --- 10 Club Activities Data ---
export type AstronomyActivity = {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  tagline: string;
  description: string;
  whatMembersDo: string[];
  equipmentUsed: string[];
  recommendedFor: string;
};

export const ASTRONOMY_ACTIVITIES: AstronomyActivity[] = [
  {
    id: 'stargazing',
    number: '01',
    title: 'Stargazing Nights & Star Parties',
    subtitle: 'Naked-eye & binocular night-sky tours',
    tagline: 'Step outside and discover the constellations, satellites, and meteor showers over the campus.',
    description: 'Casual, relaxing evening gatherings on campus open grounds or nearby dark-sky spots. Members learn naked-eye star identification, green-laser pointer celestial tours, binocular observing of star clusters, and real-time tracking of the International Space Station (ISS) overhead.',
    whatMembersDo: [
      'Learn seasonal constellation lore and navigational orientation.',
      'Spot bright satellites, iridium flares, and orbital passes.',
      'Observe meteor showers (Perseids, Geminids, Orionids).',
      'Share cozy warm drinks and informal space science discussions.',
    ],
    equipmentUsed: ['Star charts & planispheres', 'Astronomical binoculars (7x50, 10x50)', 'Red LED headlamps', 'Sky map smartphone apps'],
    recommendedFor: 'All students! Perfect for absolute beginners with zero equipment.',
  },
  {
    id: 'telescope_observation',
    number: '02',
    title: 'Telescope Observation & Operation',
    subtitle: 'Hands-on optical astronomy training',
    tagline: 'Learn how to collimate, align, and pilot optical telescopes to observe the Moon, planets, and nebulae.',
    description: 'Practical training on real optical instruments. Members gain hands-on experience setting up Dobsonian reflectors, computerized GoTo Schmidt-Cassegrains, and refractor telescopes. Learn celestial coordinates (Right Ascension & Declination), polar alignment, and eyepiece magnification matching.',
    whatMembersDo: [
      'Resolve the cratered rim of Copernicus and lunar rilles.',
      'Observe Saturn’s rings and the Cassini Division.',
      'Track Jupiter’s Great Red Spot and the four Galilean moons (Io, Europa, Ganymede, Callisto).',
      'Learn telescope maintenance, mirror cleaning, and optical collimation.',
    ],
    equipmentUsed: ['8" Dobsonian Reflectors', 'Schmidt-Cassegrain GoTo Telescopes', 'Plössl & Widefield Eyepieces', 'Lunar & Solar filters'],
    recommendedFor: 'Students curious about physical optics, engineering, and hands-on instrument handling.',
  },
  {
    id: 'astrophotography',
    number: '03',
    title: 'Astrophotography & Image Stacking',
    subtitle: 'Capturing photons across deep time',
    tagline: 'Combine photography and digital metrology to capture stunning cosmic portraits.',
    description: 'Exploring how standard DSLR cameras, mirrorless cameras, and dedicated cooled astronomical sensors capture faint deep-sky nebulae and galaxies invisible to the human eye. Members learn exposure calibration, polar tracking, and modern image processing.',
    whatMembersDo: [
      'Capture wide-field Milky Way landscape panoramas.',
      'Attach cameras to telescopes via T-rings for lunar and planetary imaging.',
      'Learn image stacking (light, dark, flat, and bias calibration frames).',
      'Process FITS and raw files using Siril, DeepSkyStacker, and Photoshop/GIMP.',
    ],
    equipmentUsed: ['DSLR & Mirrorless cameras', 'Equatorial tracking mounts (e.g. Star Adventurer)', 'Intervalometer remotes', 'Stave processing workstations'],
    recommendedFor: 'Photography enthusiasts, multimedia arts students, and digital creators.',
  },
  {
    id: 'colloquia',
    number: '04',
    title: 'Astronomy Lectures & Colloquia',
    subtitle: 'Invited talks, webinars & seminars',
    tagline: 'Engage with visiting astrophysicists, educators, and space industry researchers.',
    description: 'Inviting university faculty, national astronomy researchers (e.g. PAGASA Astronomy, DOST), and visiting scientists to deliver accessible, inspiring colloquia on active frontiers in astronomy, space telescope operations, and space exploration.',
    whatMembersDo: [
      'Attend interactive lecture series on astrophysics and cosmology.',
      'Participate in live Q&A sessions with working scientists.',
      'Host campus webinar watch parties for international space conferences.',
      'Moderate and curate guest speaker discussions.',
    ],
    equipmentUsed: ['Auditorium projection systems', 'Webinar streaming setups', 'Q&A podium systems'],
    recommendedFor: 'Students interested in physics, mathematics, philosophy, and academic research.',
  },
  {
    id: 'space_discussions',
    number: '05',
    title: 'Space Science Discussions & Debates',
    subtitle: 'Cosmology, exoplanets & astrobiology',
    tagline: 'Debate big questions: The Fermi Paradox, James Webb discoveries, and the future of human spaceflight.',
    description: 'Informal roundtable discussions examining cutting-edge space science news, philosophical questions of extraterrestrial life, commercial spaceflight ethics, orbital debris management, and cosmology debates over dark matter and cosmic inflation.',
    whatMembersDo: [
      'Deconstruct the latest research papers from arXiv and NASA press releases.',
      'Debate the ethics and engineering challenges of Mars colonization.',
      'Examine the Drake Equation and biosignature detections on exoplanets.',
      'Discuss science fiction accuracy in movies like Interstellar and The Martian.',
    ],
    equipmentUsed: ['Roundtable seminar room', 'Whiteboard mind-mapping', 'Digital journal access'],
    recommendedFor: 'Thinkers, debaters, and students across humanities, law, and science.',
  },
  {
    id: 'outreach',
    number: '06',
    title: 'Community & School Outreach',
    subtitle: 'Public science communication & education',
    tagline: 'Share the wonder of the cosmos with campus visitors, high schools, and local communities.',
    description: 'Taking telescopes to public plazas, university open houses, and local elementary/high schools. Society members become science communicators, explaining lunar craters, solar safety, and basic physics to eager young learners.',
    whatMembersDo: [
      'Set up sidewalk astronomy stations for passersby to view the Moon.',
      'Conduct safe white-light and H-alpha solar telescope viewing events.',
      'Organize interactive space trivia and scale model activities for school kids.',
      'Develop accessible astronomy educational infographics.',
    ],
    equipmentUsed: ['Certified solar filter telescopes', 'Portable public demo rigs', 'Interactive solar system scale kits'],
    recommendedFor: 'Education majors, communications students, and service-oriented volunteers.',
  },
  {
    id: 'citizen_science',
    number: '07',
    title: 'Citizen Science Projects',
    subtitle: 'Contributing to real international research',
    tagline: 'Analyze real astronomical data alongside global astronomers via platforms like Zooniverse.',
    description: 'Students do not need to wait for a master’s degree to participate in real science. Through NASA and international citizen science programs, members inspect actual spacecraft and telescope datasets to classify galaxies, detect exoplanet dips, and spot gravitational lenses.',
    whatMembersDo: [
      'Participate in Galaxy Zoo morphology classification.',
      'Analyze Kepler and TESS light curves with Planet Hunters.',
      'Search for solar storms with Solar Stormwatch.',
      'Co-author citizen science discovery papers and data validations.',
    ],
    equipmentUsed: ['Computer lab terminals', 'Zooniverse portal accounts', 'Light curve analysis spreadsheets'],
    recommendedFor: 'Computer science, data science, and analytical students eager to touch real data.',
  },
  {
    id: 'student_research',
    number: '08',
    title: 'Observational Research & Sky Surveys',
    subtitle: 'Student-led empirical documentation',
    tagline: 'Conduct observational surveys, measure light pollution, and time variable stars.',
    description: 'Proposed student research projects exploring accessible empirical physics: Measuring municipal sky glow using Sky Quality Meters (Bortle scale mapping), tracking variable star periods (AAVSO collaboration), and recording meteor shower flux rates.',
    whatMembersDo: [
      'Collect multi-point campus Bortle scale sky brightness readings.',
      'Record lunar crater shadow progressions to calculate crater wall heights.',
      'Submit visual meteor timing data to the International Meteor Organization.',
      'Present student findings at regional youth science conferences.',
    ],
    equipmentUsed: ['Sky Quality Meters (SQM)', 'Spectrometer filters', 'Digital stopwatches & lux meters'],
    recommendedFor: 'Aspiring science researchers and thesis students looking for empirical projects.',
  },
  {
    id: 'competitions',
    number: '09',
    title: 'Space Competitions & Hackathons',
    subtitle: 'NASA Space Apps & Astronomy Olympiads',
    tagline: 'Form multidisciplinary campus teams to solve real space exploration challenges.',
    description: 'Representing the university in regional and international space challenges like the annual NASA International Space Apps Challenge, national astronomy quizzes, astrophysics hackathons, and small satellite / CanSat conceptual design competitions.',
    whatMembersDo: [
      'Form cross-disciplinary teams (programmers, designers, scientists).',
      'Develop open-source web apps, games, or hardware prototypes during hackathons.',
      'Train for national university astronomy Olympiad trivia bowls.',
      'Network with aerospace industry mentors and tech innovators.',
    ],
    equipmentUsed: ['Hackathon dev rigs', '3D printing prototyping', 'NASA open APIs'],
    recommendedFor: 'Engineers, programmers, designers, and competitive quiz bowl competitors.',
  },
  {
    id: 'sky_events',
    number: '10',
    title: 'Special Celestial Events & Campouts',
    subtitle: 'Eclipses, conjunctions & dark-sky retreats',
    tagline: 'Experience rare astronomical spectacles with fellow club members under pristine dark skies.',
    description: 'Organizing expeditions and campus viewing parties for once-in-a-decade celestial alignments: total lunar eclipses, rare planetary conjunctions, comet flybys (e.g. Tsuchinshan-ATLAS), and overnight weekend observing trips to remote dark-sky locations.',
    whatMembersDo: [
      'Host campus watch parties for lunar and solar eclipses.',
      'Track newly discovered naked-eye comets and supernovae.',
      'Travel to provincial dark-sky sites with minimal light pollution.',
      'Build lifelong friendships around campfires and telescope eyepieces.',
    ],
    equipmentUsed: ['Portable field telescopes', 'Camping gear & thermal wear', 'Field power banks & red lanterns'],
    recommendedFor: 'Adventurous students who love nature, travel, and unforgettable night skies.',
  },
];

// --- Space Missions Data ---
export type SpaceMission = {
  id: string;
  name: string;
  agency: string;
  launchDate: string;
  status: string;
  headline: string;
  keyDiscoveries: string[];
  significance: string;
};

export const SPACE_MISSIONS: SpaceMission[] = [
  {
    id: 'jwst',
    name: 'James Webb Space Telescope (JWST)',
    agency: 'NASA / ESA / CSA',
    launchDate: 'December 25, 2021',
    status: 'Active at Sun-Earth L2 (1.5 million km from Earth)',
    headline: 'Unfolding the early universe in deep infrared',
    keyDiscoveries: [
      'Revealed the earliest luminous galaxies formed just 300 million years after the Big Bang (JADES-GS-z14-0).',
      'Detected water vapor, carbon dioxide, and sulfur dioxide in exoplanetary atmospheres (WASP-39b, WASP-96b).',
      'Unprecedented high-resolution views inside dusty stellar nurseries like the Pillars of Creation and Carina Nebula.',
    ],
    significance: 'Equipped with a 6.5-meter gold-coated beryllium mirror and tennis-court-sized sunshield, Webb operates at cryogenic temperatures (~40 K) to peer through cosmic dust.',
  },
  {
    id: 'voyager',
    name: 'Voyager 1 & 2 Interstellar Mission',
    agency: 'NASA / JPL',
    launchDate: 'August / September 1977',
    status: 'Active in Interstellar Space (>24 billion km from Earth)',
    headline: 'Humanity’s farthest reaching ambassadors',
    keyDiscoveries: [
      'First detailed close-up flybys of Jupiter, Saturn, Uranus, and Neptune.',
      'Discovered active volcanism on Jupiter’s moon Io and fractured ice plains on Europa.',
      'Officially crossed the heliopause into interstellar space in 2012 (Voyager 1) and 2018 (Voyager 2).',
    ],
    significance: 'Each spacecraft carries the famous gold-plated phonograph Golden Record containing sounds, music, and images of Earth to communicate the story of human civilization to potential extraterrestrial discoverers.',
  },
  {
    id: 'artemis',
    name: 'Artemis Lunar Exploration Program',
    agency: 'NASA & International Partners',
    launchDate: 'Artemis I launched Nov 2022 (Artemis II crewed upcoming)',
    status: 'Active Lunar Architecture',
    headline: 'Returning humans to the Moon and preparing for Mars',
    keyDiscoveries: [
      'Artemis I validated the Space Launch System (SLS) and uncrewed Orion spacecraft beyond the Moon and back.',
      'Targeting human landings at the Lunar South Pole to prospect water ice in permanently shadowed craters.',
      'Establishing the Lunar Gateway orbital station as a staging base for sustainable planetary science.',
    ],
    significance: 'Will land the first woman and the first person of color on the Moon, laying the technological foundation for the first human missions to Mars.',
  },
  {
    id: 'perseverance',
    name: 'Mars 2020 Perseverance & Curiosity Rovers',
    agency: 'NASA / JPL',
    launchDate: 'Perseverance launched July 2020 (Landed Feb 2021)',
    status: 'Actively exploring Jezero Crater, Mars',
    headline: 'Seeking ancient biosignatures on the Red Planet',
    keyDiscoveries: [
      'Confirmed that Jezero Crater once hosted a deep river delta and standing lake billions of years ago.',
      'Cached hermetically sealed Martian rock and regolith cores for future return to Earth.',
      'Ingenuity Mars Helicopter proved powered, controlled flight in the razor-thin Martian atmosphere with 72 successful flights.',
    ],
    significance: 'Advances astrobiological understanding of whether microbial life ever emerged on Mars when it possessed a thick atmosphere and liquid surface water.',
  },
  {
    id: 'cassini',
    name: 'Cassini-Huygens Saturnian Mission',
    agency: 'NASA / ESA / ASI',
    launchDate: 'October 1997 (Saturn arrival 2004; Grand Finale 2017)',
    status: 'Mission completed; data analysis ongoing',
    headline: 'Thirteen years revealing the wonders of Saturn',
    keyDiscoveries: [
      'Landed the ESA Huygens probe on Titan, discovering liquid methane-ethane lakes, rivers, and dunes under a thick nitrogen atmosphere.',
      'Discovered active cryovolcanic geysers erupting from a subsurface global liquid water ocean on tiny moon Enceladus.',
      'Unraveled the complex gravitational dynamics of Saturn’s rings, shepherd moons, and hexagon polar jet stream.',
    ],
    significance: 'Revolutionized ocean worlds astrobiology, establishing Enceladus and Titan as prime candidates for habitability in the outer Solar System.',
  },
];

// --- Survey Schema & Questions ---
export type SurveyScaleAnswer = 'Very interested' | 'Interested' | 'Unsure' | 'Not interested';

export type SurveyResponses = {
  q1_spaceInterest: SurveyScaleAnswer | '';
  q2_joinInterest: SurveyScaleAnswer | '';
  q3_activities: string[];
  q4_mostExcitedActivity: string;
  q5_frequency: string;
  q6_contributions: string[];
  q7_desiredEvents: string;
  q8_committeeInterest: string;
  q9_receiveUpdates: string;
  q10_generalFeedback: string;
  // Separate optional contact details
  contactOption: 'yes' | 'no' | '';
  contactName: string;
  contactEmail: string;
  contactProgramYear: string;
  timestamp?: string;
};

export const INITIAL_SURVEY_RESPONSES: SurveyResponses = {
  q1_spaceInterest: '',
  q2_joinInterest: '',
  q3_activities: [],
  q4_mostExcitedActivity: '',
  q5_frequency: '',
  q6_contributions: [],
  q7_desiredEvents: '',
  q8_committeeInterest: '',
  q9_receiveUpdates: '',
  q10_generalFeedback: '',
  contactOption: '',
  contactName: '',
  contactEmail: '',
  contactProgramYear: '',
};

export function loadExplorationState(): ExplorationState {
  if (typeof window === 'undefined') return { visitedStations: [], surveySubmitted: false };
  try {
    const raw = window.localStorage.getItem(ASTRO_STORAGE_KEY);
    if (!raw) return { visitedStations: [], surveySubmitted: false };
    const parsed = JSON.parse(raw);
    return {
      visitedStations: Array.isArray(parsed.visitedStations) ? parsed.visitedStations : [],
      surveySubmitted: Boolean(parsed.surveySubmitted),
    };
  } catch {
    return { visitedStations: [], surveySubmitted: false };
  }
}

export function saveExplorationState(state: ExplorationState) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ASTRO_STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('Could not save astro exploration state', err);
  }
}

export function saveSurveyResponses(responses: SurveyResponses) {
  if (typeof window === 'undefined') return;
  try {
    const enriched = { ...responses, timestamp: new Date().toISOString() };
    window.localStorage.setItem(ASTRO_SURVEY_KEY, JSON.stringify(enriched));
  } catch (err) {
    console.warn('Could not save astro survey responses', err);
  }
}
