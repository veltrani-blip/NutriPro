import { expect, test } from '@playwright/test'

test('landing e autenticação pública carregam sem erro de console',async({page})=>{
  const consoleErrors:string[]=[]
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text())})
  await page.goto('/')
  await expect(page.getByRole('heading',{name:/Mais tempo para cuidar/})).toBeVisible()
  await expect(page.getByRole('link',{name:'Criar conta'}).first()).toHaveAttribute('href','/cadastro')
  await expect(page.getByRole('link',{name:'Entrar'}).first()).toHaveAttribute('href','/login')
  await page.goto('/cadastro')
  await expect(page.getByRole('heading',{name:'Crie sua conta NutriPro'})).toBeVisible()
  await page.goto('/login')
  await expect(page.getByRole('heading',{name:'Bem-vindo de volta'})).toBeVisible()
  await page.goto('/recuperar-senha')
  await expect(page.getByRole('heading',{name:'Recuperar acesso'})).toBeVisible()
  expect(consoleErrors).toEqual([])
})

test('health check é mínimo e rotas protegidas exigem sessão',async({page,request})=>{
  const response=await request.get('/api/health')
  expect(response.ok()).toBe(true)
  expect(await response.json()).toMatchObject({status:'ok',service:'nutripro-web',databaseConfigured:true})
  await page.goto('/app/dashboard')
  await expect(page).toHaveURL(/\/login\?redirectTo=%2Fapp%2Fdashboard/)
  await page.goto('/portal')
  await expect(page).toHaveURL(/\/login\?redirectTo=%2Fportal/)
})

test('landing e cadastro não têm overflow estrutural no celular',async({page})=>{
  await page.setViewportSize({width:390,height:844})
  for(const route of ['/','/cadastro']){
    await page.goto(route)
    const dimensions=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}))
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client)
  }
})
