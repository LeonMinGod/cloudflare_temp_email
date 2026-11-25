const BLOCK=1024, RESERVE=512;
export const BUDGET_KEY='ops:do-write-budget:v1';

// Reserve durable blocks before spending them. Eviction loses unused credits
// conservatively; the counter is a guard-only upper bound, not an account bill.
export class WriteBudget {
  constructor(raw,{clock=()=>Date.now()}={}){
    this.raw=raw;this.clock=clock;this.credit=0;this.day='';this.reserved=0;
    raw.exec('CREATE TABLE IF NOT EXISTS guard_write_budget (day TEXT PRIMARY KEY,reserved INTEGER NOT NULL)');
  }
  refresh(){
    const day=new Date(this.clock()).toISOString().slice(0,10);
    if(day!==this.day){this.day=day;this.credit=0;this.reserved=Number([...this.raw.exec('SELECT reserved FROM guard_write_budget WHERE day=?',day)][0]?.reserved)||0;}
  }
  level(){this.refresh();return this.reserved>=90000?'critical':this.reserved>=70000?'conserve':this.reserved>=50000?'warning':'normal';}
  diagnosticAllowed(){return !['conserve','critical'].includes(this.level());}
  exec(query,...params){
    const mutation=/^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(query);
    if(mutation){
      this.refresh();
      if(this.credit<RESERVE){
        const row=[...this.raw.exec('SELECT reserved FROM guard_write_budget WHERE day=?',this.day)][0];
        this.reserved=(Number(row?.reserved)||0)+BLOCK;
        const saved=this.raw.exec('INSERT INTO guard_write_budget VALUES (?,?) ON CONFLICT(day) DO UPDATE SET reserved=excluded.reserved',this.day,this.reserved);
        this.credit+=BLOCK-Number(saved.rowsWritten||2);
      }
    }
    const cursor=this.raw.exec(query,...params);
    if(mutation)this.credit-=Number(cursor.rowsWritten??2);
    return cursor;
  }
  signal(){
    const level=this.level(),expires=Date.parse(this.day+'T00:00:00Z')+86400000;
    return {schema:1,day:this.day,level,reserved_guard_rows:this.reserved,expires,scope:'guard_reserved_upper_bound'};
  }
}
