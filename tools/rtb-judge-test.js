// RUN THE BOARD judge harness: pulls the exact judge code out of index.html and tests it against questions.json (read-only).
// Run: node tools/rtb-judge-test.js [-v]      (exit code 1 on any false accept / targeted failure)
const fs=require('fs');
const ROOT=require('path').join(__dirname,'..','games','run-the-board')+'/';
const html=fs.readFileSync(ROOT+'index.html','utf8');
const code=html.slice(html.indexOf('/*JUDGE-START*/'),html.indexOf('/*JUDGE-END*/'));
const J=new Function(code+';return {normalize,isCorrect,acceptForms,clueWords,dearticle,noArt,SOFT};')();
const Q=JSON.parse(fs.readFileSync(ROOT+'questions.json','utf8'));
const clues=[];
Q.categories.forEach(c=>c.clues.forEach(q=>clues.push({...q,cat:c.name})));
Q.finals.forEach(q=>clues.push({...q,cat:'FINAL '+q.cat}));
const VERBOSE=process.argv.includes('-v');
let pass=0,fn=[],fp=[],advFail=[];
const wraps=[x=>x,x=>x.toUpperCase(),x=>'What is '+x+'?',x=>"What's "+x,x=>'who is '+x,x=>'is it '+x,x=>"I think it's "+x,x=>'um '+x+' i think',x=>x+'.'];
function typo(s){const t=s.replace(/[^a-z]/gi,'');if(t.length<7)return null;const i=Math.floor(s.length/2);const ch=s[i];if(!/[a-z]/i.test(ch))return null;return s.slice(0,i)+(ch==='x'?'y':'x')+s.slice(i+1);}
for(const q of clues){
  const forms=[q.a].concat(q.accept||[]);
  for(const f of forms){
    for(const w of wraps){const g=w(String(f));if(J.isCorrect(g,q))pass++;else fn.push(`${q.cat} $${q.v||''} [${q.a}] guess="${g}"`);}
    const t=typo(String(f));if(t){if(J.isCorrect(t,q))pass++;else fn.push(`${q.cat} [${q.a}] TYPO guess="${t}"`);}
  }
  // generic wrong answers must fail
  for(const g of ['','   ','idk','no idea','the','a','what is','pass','i dont know',String(q.a)+' or london',String(q.a)+' or rome']){
    if(J.isCorrect(g,q)&&!/london|rome/i.test(q.a))advFail.push(`${q.cat} [${q.a}] WRONGLY ACCEPTED "${g}"`);
  }
}
// cross-check: every OTHER clue's answer vs this clue (legit equivalents excluded by overlap of accept forms)
let crossTests=0;
for(const q of clues){
  const A=new Set(J.acceptForms(q));
  for(const o of clues){
    if(o===q)continue;
    const OA=J.acceptForms(o);if(OA.some(x=>A.has(x)))continue; // same answer legitimately
    crossTests++;
    if(J.isCorrect(o.a,q))fp.push(`${q.cat} [${q.a}] accepted other answer "${o.a}"`);
  }
}
// two-answer lists: "<right answer> <other clue's answer>" and "<right> or <other>" must fail
// BENIGN: combos that happen to spell a correct answer ("e coli" IS the bacterium; "beethoven fifth" = "beethoven's fifth";
// "africa elephant" = "african elephant" with a 1-letter slip; "pi e" is glued to "pie", which speech engines write for pi).
const BENIGN=new Set(['pi e','e coli','Africa the elephant','Beethoven the Fifth']);
let listTests=0;const listFp=[],qualLists=[],benign=[];
for(const q of clues){
  const A=new Set(J.acceptForms(q));
  for(const o of clues){
    if(o===q)continue;const OA=J.acceptForms(o);if(OA.some(x=>A.has(x)))continue;
    for(const g of [q.a+' '+o.a,q.a+' or '+o.a,o.a+' '+q.a,q.a+' and '+o.a]){listTests++;if(J.isCorrect(g,q)){const ctx=J.clueWords(q);const ow=J.dearticle(J.normalize(o.a)).split(' ');const qual=g===q.a+' '+o.a&&ow.every(w=>ctx.has(w)||ctx.has(w.replace(/s$/,''))||J.SOFT.has(w));if(qual)qualLists.push(g);else if(BENIGN.has(g))benign.push(g);else listFp.push(`${q.cat} [${q.a}] accepted list "${g}"`);}}
  }
}
// clue-word qualifier positives: "<answer> <word from its own clue>"
let qualPass=0;const qualFn=[];
for(const q of clues){
  const w=J.normalize(q.c).split(' ').filter(x=>x.length>=5&&!/\d/.test(x));
  const words=w.filter((x,i)=>!['not','no'].includes(w[i-1]));if(!words.length)continue;
  const g=q.a+' '+words[words.length-1];
  if(J.isCorrect(g,q))qualPass++;else qualFn.push(`${q.cat} [${q.a}] "${g}"`);
}
// targeted cases from the brief (+ speech forms)
const T=(a,accept,guess,exp,c='')=>({q:{a,accept,c},guess,exp});
const targeted=[
  T('Au',[],'Au',1),T('Au',[],'a u',1),T('Au',[],'A U',1),T('Au',[],'A.U.',1),T('Au',[],'what is a u',1),T('Au',[],"it's au",1),T('Au',[],'gold',0),T('Au',[],'u',0),T('Au',[],'a',0),T('Au',[],'ag',0),
  T('e',["euler's number"],'e',1),T('e',["euler's number"],'E',1),T('e',["euler's number"],'the letter e',1),T('e',["euler's number"],"what is e",1),T('e',["euler's number"],'e coli',0),T('e',["euler's number"],'pi',0),T('e',["euler's number"],'eulers number',1),T('e',["euler's number"],'ee',1),
  T('pi',[],'pi',1),T('pi',[],'π',1),T('pi',[],'pie',1),T('pi',[],'e',0),T('pi',[],'phi',0),
  T('two',['2'],'2',1),T('two',['2'],'two',1),T('two',['2'],'22',0),T('two',['2'],'twenty two',0),T('two',['2'],'three',0),T('two',['2'],'12',0),
  T('1984',['nineteen eighty-four'],'1984',1),T('1984',[],'nineteen eighty four',1),T('1984',[],'1985',0),T('1984',[],'nineteen eighty five',0),T('1984',[],'198',0),T('1984',[],'19841',0),T('1984',[],'animal farm',0),
  T('118',['one hundred eighteen'],'118',1),T('118',[],'one hundred and eighteen',1),T('118',[],'11',0),T('118',[],'18',0),T('118',[],'1180',0),T('118',[],'117',0),T('118',[],'119',0),
  T('366',[],'366',1),T('366',[],'three hundred sixty six',1),T('366',[],'three sixty six',1),T('366',[],'365',0),T('366',[],'36',0),
  T('206',['two hundred six'],'two hundred and six',1),T('206',[],'206 bones',1),T('206',[],'207',0),T('206',[],'26',0),
  T('Paris',[],'is it paris',1),T('Paris',[],"what's paris",1),T('Paris',[],'Paris?',1),T('Paris',[],'paris france',0),T('lions',['lion'],'the lion king',0),T('carbon dioxide',[],'carbon monoxide',0),T('milk chocolate',[],'dark chocolate',0),T('Apollo 11',[],'apollo 13',0),T('GLP-1 agonists',['glp-1'],'glp 1 agonsts',1),T('Paris',[],'paris or london',0),T('Paris',[],'london',0),T('Paris',[],'pari',1),T('Paris',[],'parish',0),
  T('carbon dioxide',['co2'],'carbon',0),T('carbon dioxide',['co2'],'c o 2',1),T('carbon dioxide',['co2'],'CO2',1),T('carbon dioxide',['co2'],'carbon monoxide',0),
  T('milk chocolate',[],'chocolate',0),T('milk chocolate',[],'dark chocolate',0),T('South Africa',[],'africa',0),T('South Africa',[],'south africa',1),
  T('polar bear',['bear'],'brown bear',0),T('polar bear',['bear'],'bear',1),
  T('Michael Jordan',[],'jordan',1,'This Bulls legend won six NBA titles.'),T('Michael Jordan',[],'michael',0,'This Bulls legend won six NBA titles.'),T('Burger King',[],'king',0,'This chain sells the Whopper.'),
  T('Australia',[],'austria',0),T('Australia',[],'australia',1),T('Australia',[],'austrailia',1),T('Russia',[],'prussia',0),T('Albany',[],'albania',0),T('Mandarin',[],'mandolin',0),T('hydrogen',[],'nitrogen',0),T('Austin',[],'boston',0),
  T('Beyonce',['beyoncé'],'Beyoncé',1),T('creme brulee',[],'crème brûlée',1),T("McDonald's",[],'mcdonalds',1),T("McDonald's",[],'mc donalds',1),
  T('Tim Berners-Lee',['berners lee'],'berners-lee',1),T('Tim Berners-Lee',[],'tim berners lee',1),T('J.K. Rowling',['jk rowling'],'j k rowling',1),T('J.K. Rowling',[],'jk rowling',1),
  T('Apollo 11',['apollo eleven'],'apollo 11',1),T('Apollo 11',[],'apollo eleven',1),T('Apollo 11',[],'apollo 12',0),T('Apollo 11',[],'apollo thirteen',0),
  T('the 19th Amendment',[],'nineteenth amendment',1),T('the 19th Amendment',[],'18th amendment',0),T('the Fifth',['fifth','five','5'],'5th amendment',1),T('the Fifth',['fifth','five','5'],'the fifth amendment',1),
  T('Romeo and Juliet',[],'romeo & juliet',1),T('Mount Everest',[],'mt everest',1),T('Mount Everest',['everest'],'k2',0),
  T('XXXTentacion',['x'],'x',1),T('XXXTentacion',['x'],'lil peep',0),
  T('Mars',[],'planet mars',1),T('Mars',[],'the planet mars',1),T('Mars',[],'mars bar',0),T('diamond',[],'hope diamond',0),T('the Nile',['nile'],'the nile river',1),
  T('Abraham Lincoln',['lincoln'],'president lincoln',1),T('Abraham Lincoln',['lincoln'],'lincoln logs',0),T('Albert Einstein',['einstein'],'bose einstein condensate',0),
  T('Elizabeth',['elizabeth i','queen elizabeth i'],'queen elizabeth the first',1),T('Queen Elizabeth II',['elizabeth ii'],'queen elizabeth the second',1),T('King Charles III',['charles iii'],'charles the third',1),
  T('Albert',['prince albert'],'albert einstein',0),T('carbon',[],'carbon dioxide',0),T('Africa',[],'south africa',0),T('206',[],'206 bones',1),T('118',[],'118 elements',1),
  T('Taylor Swift',[],'swift',1,"This pop superstar's romance with Chiefs star Travis Kelce boosted NFL ratings."),T('South Africa',[],'africa',0,'This is the only country that borders both oceans.'),
  T('Paris',[],'paris or rome',0),T('Paris',[],'rome or paris',0),
];
// clue-word qualifiers, using the REAL clue text from questions.json
const R=(a,guess,exp)=>{const q=clues.find(x=>x.a===a);if(!q)throw new Error('no clue '+a);targeted.push({q,guess,exp});};
R('Paris','paris france',1);R('Paris','Paris, France',1);R('Paris','what is paris france',1);R('Paris','paris or london',0);R('Paris','paris and london',0);
R('Paris','london paris',0);R('Paris','paris london',0);R('Paris','paris not london',0);
R('Canberra','canberra australia',1);R('Canberra','canberra sydney',0);R('Canberra','sydney canberra',0);R('Canberra','canberra or sydney',0);
R('Mount Everest','mount everest mountain',1);R('Mount Everest','everest nepal',0);
R('Cairo','cairo egypt',1);R('Tokyo','tokyo japan',1);R('Tokyo','tokyo kyoto',0);
// ---------- FAIRNESS PASS (Sep 30): "reasonable answers count", typed AND as speech output ----------
// key = answer, or "CATEGORY|answer" when the answer appears in more than one category. 1 = must pass, 0 = must fail.
const fair=[];
const F=(key,guesses,exp)=>{const [cat,a]=key.includes('|')?key.split('|'):[null,key];
  const q=clues.find(x=>x.a===a&&(!cat||x.cat===cat));if(!q)throw new Error('no clue '+key);
  (Array.isArray(guesses)?guesses:[guesses]).forEach(g=>fair.push({q,guess:g,exp}));};
// Saint's report: the Great Wall (typed, and the way speech engines write it)
F('the Great Wall of China',['Great Wall of China','the great wall of china','The Great Wall of China.','great wall','Great Wall China','the great wall',
  'GREAT WALL OF CHINA','what is the great wall of china','great walls of china','the great wall in china','great-wall of china','greatwall of china',
  'grate wall of china','great wall of chine','the chinese wall','wall of china','its the great wall of china','Great Wall of China!',
  ['the great war of china','the great wall of china']],1);
F('the Great Wall of China',['the berlin wall','china','great','wall','the wall','great barrier reef','the great wall or the berlin wall','great wall berlin wall'],0);
// articles never matter, anywhere
F('Redeemer',['Christ the Redeemer','christ redeemer','the redeemer','Cristo Redentor'],1);
F('Jack the Ripper',['jack ripper','the ripper','Jack the Ripper'],1);
F('The Lion King',['lion king','a lion king'],1);F('the Kentucky Derby',['kentucky derby','the derby'],1);
// fill-in-the-blank: the whole phrase counts
F('Kardashians',['Keeping Up with the Kardashians','keeping up with kardashians','the kardashians','kardashian'],1);
F('Thrones',['Game of Thrones'],1);F('Lucy',['I Love Lucy'],1);F('Road',['the Silk Road','silk road'],1);F('Lakes',['the Great Lakes'],1);
F('Dead',['the Dead Sea','dead sea'],1);F('Fuji',['Mount Fuji','Mt. Fuji','mt fuji','fujiyama'],1);F('Etna',['Mount Etna','Mt Etna'],1);
F('Tutankhamun',['King Tut','king tutankhamun','tut'],1);F('Balmoral',['Balmoral Castle'],1);F('Pearl',['Pearl Harbor','pearl harbour'],1);
F('FAMOUS WOMEN IN HISTORY|Elizabeth',['Elizabeth the First','Queen Elizabeth I','elizabeth 1','Elizabeth I'],1);
F('FAMOUS WOMEN IN HISTORY|Elizabeth',['elizabeth ii','queen elizabeth the second'],0);
F('Mermaid',['The Little Mermaid'],1);F('Willie',['Steamboat Willie'],1);F('Bachelor',['The Bachelor'],1);F('Idol',['American Idol','american idle'],1);
F('Race',["RuPaul's Drag Race",'drag race'],1);F('Object',['Unidentified Flying Object','flying object'],1);F('orb',["the sovereign's orb",'sovereigns orb'],1);
F('lazuli',['lapis lazuli'],1);F('Furstenberg',['Diane von Furstenberg','Diane von Fürstenberg'],1);F('Louboutin',['Christian Louboutin'],1);
F('Albert',['Prince Albert'],1);F('Gold',['California Gold Rush','the gold rush'],1);F('Fujita',['Enhanced Fujita scale','the fujita scale'],1);
F('Mariana',['the Mariana Trench','marianas trench'],1);F('Franklin',['Rosalind Franklin'],1);F('Norgay',['Tenzing Norgay'],1);
F('Entertainment',['Nintendo Entertainment System','NES'],1);F('Boys',['the Backstreet Boys'],1);F('Navigator',['Netscape Navigator'],1);
F('Potter',['Harry Potter'],1);F('subprime',['subprime mortgages','sub prime'],1);F('Watson',['Elementary, my dear Watson','my dear watson','Dr. Watson'],1);
F('dream',['I have a dream'],1);F('Hathaway',['Berkshire Hathaway'],1);F('Mercedes',['Mercedes-Benz','mercedes benz'],1);
F('Muertos',['Dia de los Muertos','Día de los Muertos','day of the dead'],1);F('Mockingbird',['To Kill a Mockingbird'],1);F('Gatsby',['The Great Gatsby'],1);
F('coli',['E. coli','e coli'],1);F('acid',['hyaluronic acid'],1);F('fillers',['dermal fillers'],1);F('toxin',['botulinum toxin'],1);
F('glutamate',['monosodium glutamate','MSG'],1);F('40',['Red 40','red forty','red dye 40'],1);F('oil',['brominated vegetable oil'],1);
F('Tylenol',['the Tylenol murders'],1);F('cheese',['mac and cheese','mac & cheese'],1);F('pie',["shepherd's pie",'shepherds pie'],1);
F('astronaut',['ancient astronaut theory','ancient astronauts'],1);F('Arnold',['Kenneth Arnold'],1);F('heels',['high heels','heals'],1);
F('Lil Peep',['lil peep','little peep','peep'],1);F('Tylenol',['advil'],0);F('Idol',['american idiot'],0);F('Road',['silk','the silk'],0);
// numbers as digits or words, years, ordinals, roman numerals
F('206',['two hundred and six','206 bones','two hundred six'],1);F('118',['one hundred eighteen','one eighteen'],1);
F('Apollo 11',['apollo eleven','Apollo XI'.replace('XI','11')],1);F('Area 51',['area fifty one','area fifty-one'],1);
F('1984',['nineteen eighty four','Nineteen Eighty-Four'],1);F('the 19th Amendment',['the 19th amendment','nineteenth amendment','19th'],1);
F('366',['three hundred sixty six days','366 days'],1);F('120',['one hundred and twenty'],1);F('two',['the number two','2'],1);
F('the Fifth',['fifth symphony',"Beethoven's Fifth",'symphony number 5','Symphony No. 5','the 5th','5th symphony'],1);
F('Queen Elizabeth II',['Queen Elizabeth the Second','Elizabeth 2','Elizabeth II','queen elizabeth 2nd','elizabeth second'],1);
F('King Charles III',['King Charles the third','Charles 3','Charles III','charles the 3rd','prince charles'],1);
F('King Charles III',['charles ii','charles 2','charles the second'],0);F('Apollo 11',['apollo 12','apollo thirteen'],0);
// abbreviations
F('WORLD GEOGRAPHY|Mount Everest',['Mt Everest','Mt. Everest','everest','mount everest'],1);F('Mount Kilimanjaro',['Mt. Kilimanjaro','kilimanjaro'],1);
F('Mount Vesuvius',['Mt Vesuvius'],1);F('Isaac Newton',['Sir Isaac Newton','newton'],1);F('Winston Churchill',['Sir Winston Churchill'],1);
F('Arthur Conan Doyle',['Sir Arthur Conan Doyle','conan doyle'],1);F('Marie Curie',['Madame Curie','curie'],1);
// people: last name alone, full name, reversed, titles
F('US PRESIDENTS|Abraham Lincoln',['Lincoln','Abe Lincoln','President Lincoln','Lincoln, Abraham','honest abe','president abraham lincoln'],1);
F('US PRESIDENTS|Abraham Lincoln',['washington','abraham','lincoln or washington','abraham lincoln and george washington'],0);
F('US PRESIDENTS|George Washington',['Washington','president washington','Washington George'],1);
F('Richard Nixon',['President Nixon','nixon richard'],1);F('Ronald Reagan',['reagan','President Reagan'],1);
F('Franklin Roosevelt',['FDR','F.D.R.','Franklin D. Roosevelt','Franklin Delano Roosevelt','roosevelt'],1);
F('John F. Kennedy',['JFK','john kennedy','John F Kennedy','Kennedy','President Kennedy'],1);
F('MAKE SOME NOISE|Michael Jackson',['jackson','MJ','michael jackson'],1);F('Michael Jordan',['jordan','MJ','Jordan Michael'],1);
F('Immanuel Kant',['kant',"can't",'cant','Emmanuel Kant'],1);F('John Rawls',['rawls','rolls'],1);F('Czech',['check','czech language'],1);
F('SCIENCE 101|Albert Einstein',['einstein','Einstein, Albert','albert einstien'],1);F('Charles Darwin',['darwin','Darwin Charles'],1);
F('Leonardo da Vinci',['da vinci','davinci','leonardo davinci','Leonardo'],1);F('Vincent van Gogh',['van gogh','vangogh'],1);
F('Napoleon',['Napoleon Bonaparte','bonaparte','emperor napoleon'],1);F('Queen Victoria',['victoria','queen victoria'],1);
F('Princess Diana',['Lady Di','lady diana','diana','princess di','diana spencer'],1);F('Coco Chanel',['chanel','gabrielle chanel'],1);
F('Jennifer Lopez',['J.Lo','JLo','lopez'],1);F('Taylor Swift',['swift','taylor swift'],1);F('Kanye West',['ye','kanye','west'],1);
F('Beyonce',['Beyoncé','beyonce knowles'],1);F('Muhammad Ali',['ali','mohammed ali'],1);F('Mahatma Gandhi',['gandhi','ghandi'],1);
F('Kanye West',['kim kardashian','jay z'],0);F('Beyonce',['jay z','rihanna'],0);F('Meghan Markle',['prince harry','kate middleton'],0);
F('Steve Jobs',['wozniak','steve wozniak','jobs and wozniak','steve jobs and steve wozniak'],0);F('Steve Jobs',['jobs','steve jobs'],1);
// plural / singular
F('ruby',['rubies','a ruby'],1);F('emerald',['emeralds'],1);F('taco',['tacos','a taco'],1);F('croissant',['croissants'],1);
F('the pyramids',['the pyramid','the great pyramids'],1);F('the Oscars',['oscar','the oscar','academy award'],1);F('the Tonys',['tony award','tony awards'],1);
F('mummies',['a mummy','mummy'],1);F('lions',['a lion','lion','the lions'],1);F('typhoons',['a typhoon'],1);F('pretzel',['pretzels'],1);
F('the octopus',['octopi','octopuses','octopus'],1);F('the octopus',['the octopus e','squid'],0);
// joined / split words (speech engines do both)
F('Mothman',['moth man'],1);F('Bigfoot',['big foot'],1);F('SoundCloud',['sound cloud'],1);F('Starbucks',['star bucks'],1);F('Facebook',['face book'],1);
F('Stonehenge',['stone henge'],1);F("McDonald's",['mc donalds','mcdonald','macdonalds'],1);F('the iPod',['i pod','ipod'],1);F('chemtrails',['chem trails'],1);
// accents, &, hyphens
F('creme brulee',['crème brûlée'],1);F('Hermes',['Hermès'],1);F('El Nino',['El Niño'],1);F('Romeo and Juliet',['Romeo & Juliet'],1);
F('Hiroshima and Nagasaki',['Hiroshima & Nagasaki','nagasaki and hiroshima','hiroshima'],1);F('Hiroshima and Nagasaki',['hiroshima or tokyo','tokyo'],0);
F('Moby-Dick',['moby dick','mobydick'],1);F('the Koh-i-Noor',['kohinoor','koh i noor'],1);F('Tyrannosaurus rex',['T-Rex','t rex','T. rex'],1);
// transposed-letter typos count as ONE slip
F('the Eiffel Tower',['the eiffle tower','eifel tower'],1);F('Canberra',['canbera','canberra'],1);
// hedges and different answers stay wrong
F('Paris',['paris or rome','either paris or london','paris london','london'],0);F('Canberra',['sydney','canberra or sydney','sydney canberra'],0);
F('Mars',['mars or jupiter','jupiter'],0);F('Poseidon',['zeus','zeus poseidon','poseidon or zeus'],0);F('ruby',['ruby emerald','emerald or ruby'],0);
F('Lake Victoria',['queen victoria'],0);F('Queen Victoria',['lake victoria'],0);F('the blue whale',['whale','the sperm whale'],0);
F('the Sun',['the sun','sun','the son'],1);F('the Sun',['the moon','the sun or the moon'],0);F('Au',['ag','gold'],0);
const fFail=[];let fPos=0,fNeg=0;
for(const t of fair){const got=J.isCorrect(t.guess,t.q)?1:0;t.exp?fPos++:fNeg++;if(got!==t.exp)fFail.push(`${t.q.cat} [${t.q.a}] ${JSON.stringify(t.guess)} expected ${t.exp?'PASS':'FAIL'} got ${got?'PASS':'FAIL'}`);}
// speech-ified variants of EVERY accept form: lowercase, no punctuation, digits spoken as words, "the" in front, & <-> and
const ONES=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
const TENS=['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
function n2w(n){if(n<20)return ONES[n];if(n<100)return TENS[Math.floor(n/10)]+(n%10?' '+ONES[n%10]:'');if(n<1000)return ONES[Math.floor(n/100)]+' hundred'+(n%100?' '+n2w(n%100):'');if(n>=1100&&n<2100&&n%100)return n2w(Math.floor(n/100))+' '+(n%100<10?'oh '+ONES[n%100]:n2w(n%100));return String(n);}
function speech(s){return s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/&/g,' and ').replace(/(\d+)(st|nd|rd|th)?\b/g,(m,d,o)=>' '+(o&&+d<20?['','first','second','third','fourth','fifth','sixth','seventh','eighth','ninth','tenth','eleventh','twelfth','thirteenth','fourteenth','fifteenth','sixteenth','seventeenth','eighteenth','nineteenth'][+d]:n2w(+d))+' ').replace(/[^a-z' ]+/g,' ').replace(/'/g,'').replace(/\s+/g,' ').trim();}
let vTotal=0;const vFail=[];
for(const q of clues){const V=new Set();
  for(const f of [q.a].concat(q.accept||[])){const s=String(f);V.add(speech(s));if(!/^(the|a|an) /i.test(s))V.add('the '+s);V.add(s.replace(/-/g,' '));V.add(s.replace(/ and /gi,' & '));V.add(s.replace(/\bMount\b/,'Mt.'));V.add(s.toUpperCase());}
  for(const g of V){if(!g)continue;vTotal++;if(!J.isCorrect(g,q))vFail.push(`${q.cat} [${q.a}] "${g}"`);}}
const tFail=[];for(const t of targeted){const got=J.isCorrect(t.guess,t.q)?1:0;if(got!==t.exp)tFail.push(`[${t.q.a}] "${t.guess}" expected ${t.exp?'PASS':'FAIL'} got ${got?'PASS':'FAIL'}`);}
// array (speech alternatives)
if(!J.isCorrect(['paris is','Paris'],{a:'Paris'}))tFail.push('alternatives array not honoured');
console.log(`clues: ${clues.length}`);
console.log(`positive checks: ${pass} passed, ${fn.length} false negatives`);
fn.slice(0,VERBOSE?999:40).forEach(x=>console.log('  FN',x));
console.log(`generic-wrong checks: ${clues.length*11}, wrongly accepted: ${advFail.length}`);advFail.forEach(x=>console.log('  ',x));
console.log(`cross-answer checks: ${crossTests}, wrongly accepted: ${fp.length}`);fp.slice(0,VERBOSE?999:60).forEach(x=>console.log('  FP',x));
console.log(`two-answer list checks: ${listTests}, wrongly accepted: ${listFp.length}; accepted as own-clue qualifier (by design): ${qualLists.length}`);console.log("  e.g. "+qualLists.slice(0,12).join(" | "));listFp.slice(0,VERBOSE?999:60).forEach(x=>console.log('  LIST',x));
console.log(`answer+own-clue-word checks: ${qualPass+qualFn.length}, passed: ${qualPass}`);qualFn.slice(0,20).forEach(x=>console.log('  QFN',x));
console.log(`targeted cases: ${targeted.length+1}, failures: ${tFail.length}`);tFail.forEach(x=>console.log('  ',x));
console.log(`fairness cases: ${fair.length} (${fPos} must-accept, ${fNeg} must-reject), failures: ${fFail.length}`);fFail.forEach(x=>console.log('  FAIR',x));
console.log(`speech/typed variants of every answer: ${vTotal}, rejected: ${vFail.length}`);vFail.slice(0,VERBOSE?999:40).forEach(x=>console.log('  VAR',x));
console.log(`benign list combos (spell a right answer): ${benign.length}`);
process.exitCode=(advFail.length||fp.length||listFp.length||tFail.length||fFail.length||vFail.length)?1:0;
