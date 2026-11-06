"""Read-only quota investigation. Calls Cloudflare control-plane APIs, never site URLs."""
import base64,datetime,json,os,re,sys,urllib.request,urllib.error
from pathlib import Path
from production_crypto import seal,checked_id

API='https://api.cloudflare.com/client/v4'
OUT=Path('production-operation')

def api(path,body=None):
    headers={'Authorization':'Bearer '+os.environ['CLOUDFLARE_API_TOKEN'].strip(),'User-Agent':'Owner-ReadOnly-Quota-Audit/1.0'}
    if body is not None:headers['Content-Type']='application/json'
    request=urllib.request.Request(API+path,headers=headers,data=None if body is None else json.dumps(body).encode())
    try:
        with urllib.request.urlopen(request,timeout=40) as response:return json.load(response)
    except urllib.error.HTTPError as error:
        raw=error.read(100000)
        try:detail=json.loads(raw)
        except Exception:detail={'message':raw.decode(errors='replace')[:2000]}
        return {'http_error':error.code,'detail':detail}
    except Exception as error:return {'network_error':type(error).__name__}

def graphql(query):
    if 'mutation' in query.lower():raise ValueError('This audit permits queries only')
    return api('/graphql',{'query':query})

def query_rows(account,start,end,dimensions='scriptName',extra='',worker=None):
    filters='datetime_geq:'+json.dumps(start)+',datetime_lt:'+json.dumps(end)
    if worker:filters+=',scriptName:'+json.dumps(worker)
    query='{viewer{accounts(filter:{accountTag:'+json.dumps(account)+'}){workersInvocationsAdaptive(limit:10000,filter:{'+filters+'}){dimensions{__typename '+dimensions+'}sum{__typename requests '+extra+'}}}}}'
    response=graphql(query)
    try:
        if response.get('errors'):return None,response
        return response['data']['viewer']['accounts'][0]['workersInvocationsAdaptive'],None
    except (KeyError,IndexError,TypeError):return None,response

def fields(name):
    response=graphql('{__type(name:'+json.dumps(name)+'){fields{name}}}')
    try:return [f['name'] for f in response['data']['__type']['fields']]
    except (KeyError,TypeError):return []

def main():
    OUT.mkdir(exist_ok=True)
    request=json.loads(Path('.github/cf-usage-audit-request.json').read_text())
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{5,100}',request['request_id']):raise ValueError('Invalid audit request identity')
    checked_id(request['session'])
    with open(os.environ['GITHUB_ENV'],'a') as env:env.write('OPS_REQUEST_ID='+request['request_id']+'\n')
    account=os.environ['CLOUDFLARE_ACCOUNT_ID'].strip()
    days=[datetime.date.fromisoformat(value) for value in request['days']]
    if len(days)>3:raise ValueError('Audit range limited to three days')
    data={'collected_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'days':{},'metadata':{}}
    scripts=api('/accounts/'+account+'/workers/scripts')
    data['metadata']['scripts']=[{k:s.get(k) for k in ['id','created_on','modified_on','usage_model']} for s in scripts.get('result',[]) ] if isinstance(scripts.get('result'),list) else scripts
    data['metadata']['domains']=api('/accounts/'+account+'/workers/domains')
    zones=api('/zones?name=leonmingod.com')
    for zone in zones.get('result',[]) if isinstance(zones.get('result'),list) else []:
        if zone.get('name')=='leonmingod.com':
            data['metadata']['routes']=api('/zones/'+zone['id']+'/workers/routes')
            data['metadata']['zone_id']=zone['id']
    dimension_fields=[];sum_fields=[];current=None
    for day in days:
        start=day.isoformat()+'T00:00:00Z';end=(day+datetime.timedelta(days=1)).isoformat()+'T00:00:00Z'
        rows,error=query_rows(account,start,end)
        entry={'start_utc':start,'end_utc':end,'totals':rows,'error':error};data['days'][str(day)]=entry
        if rows is None:continue
        if rows and not dimension_fields:
            dimension_fields=fields(rows[0]['dimensions']['__typename']);sum_fields=fields(rows[0]['sum']['__typename'])
            data['dimension_fields']=dimension_fields;data['sum_fields']=sum_fields
        if str(day)==request['focus_day']:current=entry
    if current is not None:
        extra=' '.join(x for x in ['errors','subrequests'] if x in sum_fields)
        bucket=next((x for x in ['datetimeHour','datetimeFifteenMinutes'] if x in dimension_fields),None)
        if bucket:
            rows,error=query_rows(account,current['start_utc'],current['end_utc'],'scriptName '+bucket,extra)
            current['time_bucket']=bucket;current['time_series']=rows;current['time_series_error']=error
        else:
            current['time_bucket']='one_hour_queries';current['time_series']=[]
            start=datetime.datetime.fromisoformat(current['start_utc'].replace('Z','+00:00'))
            now=datetime.datetime.now(datetime.timezone.utc)
            for hour in range(24):
                a=start+datetime.timedelta(hours=hour);b=a+datetime.timedelta(hours=1)
                if a>now:break
                rows,error=query_rows(account,a.strftime('%Y-%m-%dT%H:%M:%SZ'),b.strftime('%Y-%m-%dT%H:%M:%SZ'),extra=extra)
                if rows is None:current['time_series_error']=error;break
                for row in rows:row['dimensions']['auditHour']=a.isoformat()
                current['time_series'].extend(rows)
        if 'status' in dimension_fields:
            current['execution_statuses'],current['status_error']=query_rows(account,current['start_utc'],current['end_utc'],'scriptName status',extra)
        if request.get('detail_worker'):
            name=request['detail_worker']
            if request.get('detail_minutes') and 'datetimeMinute' in dimension_fields:
                minutes=int(request['detail_minutes'])
                if not 1<=minutes<=30:raise ValueError('Minute detail window limited to 30 minutes')
                now=datetime.datetime.now(datetime.timezone.utc)
                detail_end=min(now,datetime.datetime.fromisoformat(current['end_utc'].replace('Z','+00:00')))
                detail_start=max(detail_end-datetime.timedelta(minutes=minutes),datetime.datetime.fromisoformat(current['start_utc'].replace('Z','+00:00')))
                current['worker_minutes'],current['worker_minutes_error']=query_rows(account,detail_start.strftime('%Y-%m-%dT%H:%M:%SZ'),detail_end.strftime('%Y-%m-%dT%H:%M:%SZ'),'scriptName datetimeMinute',extra,worker=name)
            dims='scriptName '+' '.join(x for x in ['httpResponseStatus','eventType','status'] if x in dimension_fields)
            current['worker_details'],current['worker_details_error']=query_rows(account,current['start_utc'],current['end_utc'],dims,extra,worker=name)
            if 'scriptVersion' in dimension_fields:
                current['worker_versions'],current['worker_versions_error']=query_rows(account,current['start_utc'],current['end_utc'],'scriptName scriptVersion httpResponseStatus',extra,worker=name)
            zone=data['metadata'].get('zone_id')
            if zone and request.get('detail_host'):
                query='{viewer{zones(filter:{zoneTag:'+json.dumps(zone)+'}){httpRequestsAdaptiveGroups(limit:100,orderBy:[count_DESC],filter:{datetime_geq:'+json.dumps(current['start_utc'])+',datetime_lt:'+json.dumps(current['end_utc'])+',clientRequestHTTPHost:'+json.dumps(request['detail_host'])+'}){count dimensions{clientRequestHTTPHost clientRequestPath edgeResponseStatus}}}}}'
                current['zone_path_counts']=graphql(query)
    OUT.joinpath('owner.enc.json').write_bytes(seal(json.dumps(data).encode(),base64.b64decode(request['owner_public_key']),request['session'],'cf-request-usage-audit'))
    available=current is not None
    ranking=[] if not available else sorted([{'worker':r['dimensions'].get('scriptName'),'requests':r['sum']['requests']} for r in current['totals']],key=lambda r:r['requests'],reverse=True)
    report={'status':'passed' if available else 'partial','mode':'cf-usage-audit','read_only_control_plane':True,'site_requests_made':0,'focus_day_utc':request['focus_day'],'analytics_available':available,'workers':ranking,'total_requests':sum(r['requests'] for r in ranking),'private_details_encrypted':True}
    OUT.joinpath('report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
    if not available:sys.exit(1)

if __name__=='__main__':main()
