<?php
// Dry-run only. Emit native Docker Manager command for the staged template.
$docroot='/usr/local/emhttp';
$driver=['bridge'=>'bridge','host'=>'host','none'=>'none'];
$subnet=['bridge'=>'172.17.0.0/16','host'=>'','none'=>''];
$ident=parse_ini_file('/boot/config/ident.cfg');
$var=['timeZone'=>'America/Los_Angeles','NAME'=>$ident['NAME']];
require "$docroot/plugins/dynamix.docker.manager/include/Helpers.php";
$result=xmlToCommand('/mnt/fastssd/AppData/creator-studio-stage/my-creator-studio.xml',true);
echo json_encode($result,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES),"\n";
